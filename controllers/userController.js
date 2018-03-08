var User = require('../models/user');
var Year = require('../models/year');
var Day = require('../models/day');

var async = require('async');
var bcrypt = require('bcrypt');
const { body,validationResult } = require('express-validator/check');
const { sanitizeBody } = require('express-validator/filter');

const saltRounds = 10;

exports.user_list = function(req, res, next) {
    
    User.find()
        .sort([[ 'username', 'ascending' ]])
        .exec(function (err, list_users) {
            if (err) { return next(err); }
            res.render('user_list', { title: 'Users', user_list: list_users })
        })
}

exports.user_detail = function(req, res, next) {
    async.parallel({
        user: function(callback) {
            User.findById(req.params.id, {"password": 0})
                .populate({
                    path: 'years',
                    populate: { path: 'days' },
                })
                .exec(callback)
        }
    }, function(err, results) {
        if (err) { return next(err); }
        if (results.user == null) {
            var err = new Error('User not found');
            err.status = 404;
            return next(err);
        }
        res.render('user_detail', { title: 'User detail', user: results.user })
    });
}

exports.user_create_get = function(req, res) {
    res.render('signup', { title: "Signup"});
}

exports.user_create_post = [
    body('username').isLength({ min: 1}).trim().withMessage('Username must be specified').isAlphanumeric().withMessage('Username has non-alphanumeric characters.'),
    body('password').isLength({ min: 1}).withMessage('Password must be specified'),

    sanitizeBody('username').trim().escape(),
    sanitizeBody('password').escape(),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.render('signup', { title: "Signup", user: req.body, errors: errors.array() });
            return;
        } else {
            var days = [];
            //var initialDate = new Date(Date.now.getFullYear(), 1, 1);
            var initialDate = new Date();
            //initialDate = new Date(initialDate.getFullYear(), 0, 1);
            console.log(initialDate)
            for (var i = 0; i < 365; i++){
                var date = new Date(initialDate.getFullYear(), 0, 1);
                date.setDate(date.getDate() + i)
                var day = new Day({
                    mood: 'unassigned',
                    date: date,
                });
               //   day.save(function(err) {
               //        if (err) { return next(err); }
               //   })
                days.push(day);
            }
            async.each(days, function(day, callback) {
                day.save(function (err) {
                    if (err) { return callback(err) }
                })
            }, function (err) {
                if (err) { return next(err) }
            });
            var year = new Year({
                days: days
            })
            async.parallel({
                year: function(callback) {
                    year.save(function (err) {
                        if (err) {
                            callback(err);
                            return;
                        }
                    })
                    return callback(null, year);
                },
                hash: function(callback) {
                    bcrypt.hash(req.body.password, saltRounds, function(err, hash) {
                        if (err) {
                            callback(err);
                            return
                        }
                        return callback(null, hash);
                    })
                }
            }, function (err, results) {
                console.log ("results: " + results);
                if (err) { return next(err) }
                var user = new User({
                    username: req.body.username,
                    password: results.hash,
                    years: [results.year]
                });
                user.save(function (err) {
                    if (err) { return next(err); }
                    res.redirect('/users');
                }) 
            });
            //bcrypt.hash(req.body.password, saltRounds, function(err, hash) {
            //    if (err) { return next(err) }
            //    var user = new User({
            //        username: req.body.username,
            //        password: hash,
            //        years: [year]
            //    });
            //    year.save(function (err) {
            //        if (err) { return next(err); }
            //    })
            //    user.save(function (err) {
            //        if (err) { return next(err); }
            //        res.redirect('/users');
            //    })
            //})
        }
    }
];

exports.user_update_post = function(req, res, next) {
    console.log("called correct func");
    console.log(req.params.id)
    console.log(req.body.mood)

    var curDate = new Date()
    async.parallel({
        user: function(callback) {
            User.findById(req.params.id)
                .populate({
                    path: 'years',
                    populate: { path: 'days' },
                })
                .exec(callback)
        }
    }, function(err, results) {
        if (err) { return next(err); }
        if (results.user == null) {
            var err = new Error('User not found');
            err.status = 404;
            return next(err);
        }
        //console.log(results.user.years)
        var year = results.user.years.find(function(el) {
             return el.year === curDate.getFullYear()
        })
        //var curDay = year.days[0];
        var curDay = year.days.find(function (el) {
            return el.date.getMonth() === curDate.getMonth() &&
                el.date.getDate() === curDate.getDate();
        })
        var newDay = new Day({
            mood: req.body.mood,
            date: curDay.date,
            _id: curDay._id
        })
        Day.findByIdAndUpdate(curDay._id, newDay, {}, function(err, day) {
           if (err) { return next(err) }
           res.redirect(results.user.url)
        });
        //res.render('user_detail', { title: 'User detail', user: results.user })
    });
};

exports.user_login_post = [
    body('username').isLength({ min: 1}).trim().withMessage('Username must be specified').isAlphanumeric().withMessage('Username has non-alphanumeric characters.'),
    body('password').isLength({ min: 1}).withMessage('Password must be specified'),

    sanitizeBody('username').trim().escape(),
    sanitizeBody('password').escape(),

    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            res.render('login', { title: "Login", user: req.body, errors: errors.array() });
            return;
        } else {
            async.parallel({
                user: function(callback) {
                    User.findOne({'username': req.body.username})
                        .exec(callback)
                }
            }, function(err, results) {
                if (err) { return next(err); }
                if (results.user == null) {
                    //var err = new Error('No user found with given username and password');
                    var err = {"msg" : 'No user found with given username.'}
                    res.render('login', {title: 'Login', user: results.user, errors: [err]});
                    return
                }
                var hash = results.user.password;
                bcrypt.compare(req.body.password, hash, function(err, bcryptResult) {
                    if (err) { return next(err) }
                    res.redirect(results.user.url)
                })
            })
        }
    }
]











