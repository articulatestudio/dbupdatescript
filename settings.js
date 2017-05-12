var settings = {
    "replyAiWebHook": "/handlers/external/received/d4a8dd5f-4eda-40b7-8dd5-8b2572d46590/",
    "httpServerPort": process.env.PORT || 80,
    //"mongoUri": process.env.MONGODB_URI || "mongodb://eleven:eleven11@ds133771-a0.mlab.com:33771,ds133771-a1.mlab.com:33771/heroku_b2v9lgzf?replicaSet=rs-ds133771",
    "mongoUri": process.env.MONGODB_URI || "mongodb://heroku_1c3055cr:q3pqj2elcqj6n6g7dp64t29bt2@ds145659.mlab.com:45659/heroku_1c3055cr",
    "xmlUrls" : [
        "http://www.goalserve.com/getfeed/e2b9882859c64657bae5615d1a29026b/racing/uk",
    ],
    "dateOffset": 2
};

module.exports = settings;
