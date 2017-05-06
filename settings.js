var settings = {
    "replyAiWebHook": "/handlers/external/received/d4a8dd5f-4eda-40b7-8dd5-8b2572d46590/",
    "httpServerPort": process.env.PORT || 80,
    "mongoUri": process.env.MONGODB_URI || "mongodb://lewis:lewis@ds127451-a0.mlab.com:27451/heroku_cllxmt07",
    "xmlUrls" : [
        "http://www.goalserve.com/getfeed/e2b9882859c64657bae5615d1a29026b/racing/uk",
        "http://www.goalserve.com/getfeed/e2b9882859c64657bae5615d1a29026b/racing/uk_tomorrow"
    ],
    "dateOffset": 2
};

module.exports = settings;
