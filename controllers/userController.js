var User = require('../models/user');
var Year = require('../models/year');
var Day = require('../models/day');
var utils = require('./dbUtils');

var async = require('async');
var bcrypt = require('bcrypt');
const _ = require('underscore');
const { body,validationResult } = require('express-validator/check');
const { sanitizeBody } = require('express-validator/filter');

exports.user_list = function(req, res, next) {
    User.find()
        .sort([[ 'username', 'ascending' ]])
        .exec(function (err, list_users) {
            if (err) { return next(err); }
            console.log(req.session)
            res.render('user_list', { title: 'Users', user_list: list_users })
        })
}

exports.user_detail = function(req, res, next) {
    utils.verifySession(req, req.session, function(err, results) {
        if (err) { return next(err); }
        console.log(results)
        if (results.verified) {
            res.render('user_detail', {
                title: `Mood Journal (${results.user.username})`,
                user: results.user,
                options: utils.defaultMoodOptions
            })
        } else {
            res.redirect('/login');
        }
    });
}

exports.user_create_get = function(req, res) {
    res.render('signup', { title: "Signup"});
}

exports.user_create_post = [
    body('username').isLength({ min: 1}).trim().withMessage('Username must be specified')
        .isAlphanumeric().withMessage('Username has non-alphanumeric characters.'),
    body('password').isLength({ min: 1}).withMessage('Password must be specified'),

    sanitizeBody('username').trim().escape(),
    sanitizeBody('password').escape(),
    sanitizeBody('passwordAgain').escape(),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.render('signup', { title: "Signup", user: req.body, errors: errors.array() });
            return;
        }

        // This can be refactored to use the ES7 await function to reduce depth. Still experimental though.
        // Alternatively, major refactoring with Promises and two catch statements
        User.findOne({'username': req.body.username}).exec(function(err, existingUser) {
            if (err) { return next(err); }
            if (existingUser) {
                var error = {"msg": "Username already exists."};
                return res.render('signup', {title: "Signup", errors: [error]});
            }
            if (req.body.password !== req.body.passwordAgain) {
                var error = {"msg": "Passwords do not match."};
                return res.render('signup', {title: "Signup", errors: [error], username: req.body.username});
            }
            utils.create_new_user(req.body.username, req.body.password, function(err, user) {
                if (err) { return next(err); }
                req.session.user = user.username;
                req.session.password = user.password;
                req.session.url = user.url;
                res.redirect(user.url);
            });
        })
    }
];

// Good opportunity to use decorators. May justify using promises as well
exports.user_update_post = function(req, res, next) {
    var curDate = new Date(req.body.date)
    console.log(req.body.date)
    console.log(curDate.toUTCString())
    //console.log(curDate.getFullYear() + " " + curDate.getMonth() + " " + curDate.getDate())
    console.log("Note: " + req.body.note);
    utils.verifySession(req, req.session, function(err, results) {
        if (err) { return next(err); }
        if (!results.verified) {
            res.redirect('/login');
        }
        var user = results.user;
        var year = user.years.find(function(el) {
             return el.year === curDate.getUTCFullYear()
        })
        if (year == null) {
            var err = new Error('No Year found');
            return next(err);
        }
        var curDay = year.days.find(function (el) {
            return el.date.getUTCMonth() === curDate.getUTCMonth() &&
                el.date.getUTCDate() === curDate.getUTCDate();
        })
        var newDay = new Day({
            mood: req.body.mood,
            date: curDay.date,
            note: req.body.note,
            _id: curDay._id
        })
        Day.findByIdAndUpdate(curDay._id, newDay, {}, function(err, day) {
           if (err) { return next(err) }
           res.redirect(user.url)
           //res.render('partials/mood_graph', {user: user, layout: false});
        });
    });
};

exports.login_get = function (req, res) {
    res.render('login', { title: "Login" });
}

exports.user_login_post = [
    body('username')
        .isLength({ min: 1}).trim().withMessage('Username must be specified')
        .isAlphanumeric().withMessage('Username has non-alphanumeric characters.'),
    body('password').isLength({ min: 1}).withMessage('Password must be specified'),

    sanitizeBody('username').trim().escape(),
    sanitizeBody('password').escape(),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.render('login', { title: "Login", user: req.body, errors: errors.array()});
            return;
        }
        User.findOne({'username': req.body.username})
        .exec(function(err, user) {
            if (err) { return next(err); }
            if (user == null) {
                var err = {"msg" : 'No user found with given username.'}
                res.render('login', {title: 'Login', errors: [err]});
                return
            }
            var hash = user.password;
            bcrypt.compare(req.body.password, hash, function(err, bcryptResult) {
                if (err) { return next(err) }
                if (!bcryptResult) {
                    var err = {"msg" : 'Incorrect password.'}
                    res.render('login', {title: 'Login', username: req.body.username, errors: [err]});
                    return
                }
                req.session.user = user.username;
                req.session.password = user.password;
                req.session.url = user.url;

                // Update year
                var currentYear = new Date().getUTCFullYear();
                var year = user.years.find(function(el) {
                     return el.year === currentYear;
                })
                if (year == null) {
                    utils.create_new_year(currentYear, function(err, returnedYear) {
                        console.log(returnedYear);
                        if (err) { return; }
                        user.years.push(returnedYear);
                        user.save();
                    });
                }

                console.log(req.session)
                res.redirect(user.url)
            })
        })
    }
]

exports.user_logout_get = function(req, res) {
    req.session.destroy();
    res.redirect("/")
}


