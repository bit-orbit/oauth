require("dotenv").config();

const express = require("express");
const cors = require("cors");
const passport = require("passport");
const csurf = require("csurf");
const GitHubStrategy = require("passport-github2").Strategy;
const cookieParser = require("cookie-parser");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const { Octokit } = require("@octokit/rest");

const app = express();

app.use(express.json());
app.use(cookieParser());
// app.use(csurf({ cookie: true }));
app.use(
  cors({
    origin: process.env.CLIENT_BASE_URL,
    credentials: true,
  })
);
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: process.env.NODE_ENV === "production", httpOnly: true },
    store: new SQLiteStore(),
  })
);

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function (user, cb) {
  const { profile, accessToken, refreshToken } = user;

  process.nextTick(function () {
    cb(null, {
      id: profile.id,
      username: profile.username,
      name: profile.displayName,
      accessToken,
      refreshToken,
    });
  });
});

passport.deserializeUser(function (user, cb) {
  process.nextTick(function () {
    return cb(null, user);
  });
});

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_REDIRECT_URL,
    },
    function (accessToken, refreshToken, profile, done) {
      process.nextTick(function () {
        return done(null, { profile, accessToken, refreshToken });
      });
    }
  )
);

app.get("/", (req, res) => {
  res.send("ok");
});

app.get(
  "/auth/github",
  passport.authenticate("github", { scope: ["user:email", "repo"] })
);

app.get(
  "/auth/callback",
  passport.authenticate("github", {
    failureRedirect: process.env.CLIENT_HOME_URL,
    successRedirect: process.env.CLIENT_HOME_URL,
  })
);

app.get(
  "/auth/me",
  passport.authenticate("session"),
  (req, res, next) => {
    if (req.user) {
      return next();
    }
    res.redirect("/auth/github");
  },
  (req, res) => {
    const user = req.user;

    res.json({ user: { id: user.id, username: user.username } });
  }
);

app.post(
  "/chapter",
  (req, res, next) => {
    if (req.user) {
      return next();
    }
    res.redirect("/auth/github");
  },
  (req, res) => {
    const { title, body } = req.body;

    if (!title.trim().length || !body.trim().length) {
      res.status(400).json({ error: "عنوان یا متن فصل نمیتواند خالی باشد" });
    }

    try {
      const octokit = new Octokit({
        auth: req.user.accessToken,
      });

      octokit.rest.issues.create({
        owner: process.env.GITHUB_REPO_OWNER,
        repo: process.env.GITHUB_REPO_NAME,
        title,
        body,
        labels: ["chapter"],
      });
    } catch (e) {
      res
        .status(500)
        .json({ error: "خطا در ارسال فصل. لطفا دوباره امتحان کنید" });
    }

    res.send();
  }
);

app.get("/logout", function (req, res) {
  req.logout();
  res.redirect("/");
});

app.use((err, _req, res, next) => {
  res.status(500).json({ error: "خطای سرور" });
});

app.listen(Number(process.env.PORT) || 3000, () => {
  console.log("Server is running");
});
