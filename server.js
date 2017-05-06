var WebSocketServer = require('websocket').server;
var http = require('http');
var settings = require('./settings');
var HttpDispatcher = require('httpdispatcher');
var crypto = require('crypto');
var dispatcher = new HttpDispatcher();
var https = require('https');
var querystring = require('querystring');
var MongoClient = require('mongodb').MongoClient;

// Clients class for ios proxy
function Clients() {
    this.db = false;
    this.pengingMessagesCollection = "tiptap_pendingMessages";

    this.tournamentCollection = 'tiptap_tournaments';
    this.racesCollection = 'tiptap_races';
    this.horsesCollection = 'tiptap_horses';
    this.oddsCollection = 'tiptap_odds';
    this.tipsCollection = 'tiptap_tips';
    this.clients = {};
    var self = this;
    MongoClient.connect(settings.mongoUri, function (err, db) {
        if (err) {
            console.log('Failed to connect to the database.', err.stack);
        } else {
            console.log("Connected successfully to mongo server");
            self.db = db;
        }
    });
}
//saving user uuid and channel hash to storage
Clients.prototype.add = function (channel, uuid) {
    if (typeof this.clients[channel] == 'undefined') {
        this.clients[channel] = {
            'uuid': uuid,
            'channel': channel,
            'connection': ''
        };
    }
    return this;
};
//saving websocket connection to storage
Clients.prototype.saveConnection = function (channel, connection) {
    if (this.checkChannel(channel)) {
        this.clients[channel]['connection'] = connection;
        return this.clients[channel]['uuid']
    }
    return false;
};
// remove user connection data from storage after user closed websocket connection
Clients.prototype.removeConnection = function (channel) {
    if (this.checkChannel(channel)) {
        delete this.clients[channel];
    }
};
//check if channel exists in storage
Clients.prototype.checkChannel = function (channel) {
    return typeof this.clients[channel] != 'undefined';
};
//getting json from string received in websocket
Clients.prototype.getMessage = function (message) {
    try {
        return JSON.parse(message);
    } catch (e) {
        console.error(e);
        return null;
    }
};
// function to send message  from app to reply.ai
Clients.prototype.makeRequest = function (uuid, message) {
    var client = this.getClientByUuid(uuid);
    if (client != false) {
        console.log('Sending <-', client.uuid, client.channel);
        var postData = querystring.stringify({
            from: uuid,
            text: message
        });
        var options = {
            host: 'www.reply.ai',
            port: 443,
            method: 'POST',
            path: settings.replyAiWebHook,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': postData.length,
                'Accept': '*/*'
            }
        };
        var req = https.request(options, function (res) {
            res.on('error', function (err) {
                console.log(err);
            })
        });
        req.on('error', function (err) {
            console.log(err);
        });
        req.write(postData);
        req.end();
    } else {
        console.log("Client with uuid %s not found", uuid);
    }
};
// get client object by uuid
Clients.prototype.getClientByUuid = function (uuid) {
    for (var i in this.clients) {
        if (this.clients[i]['uuid'] == uuid) {
            return this.clients[i];
        }
    }
    return false;
};
// send messages received from reply.ai when user was offline
Clients.prototype.sendPendingMessages = function (uuid, callback) {
    if (this.db) {
        this.db.collection(this.pengingMessagesCollection)
            .find({uuid: uuid})
            .each(function (err, document) {
                if (document != null) {
                    callback(document);
                }
            });
    }
};
// saving messages to mongodb if user is offline
Clients.prototype.saveMessage = function (message) {
    if (this.db) {
        this.db.collection(this.pengingMessagesCollection).insertOne({
            "uuid": message['contact_urn'],
            "message": message
        });
    }
};
clients = new Clients();

//server initialization
var server = http.createServer(function (request, response) {
    try {
        dispatcher.dispatch(request, response);
    } catch (err) {
        console.log(err);
    }
});
// endpoint for ios app
dispatcher.onPost('/getChannel', function (req, res) {
    var channel = crypto.randomBytes(20).toString('hex');
    var response = {};
    res.writeHead(200, {'Content-Type': 'application/json'});
    if (typeof req.params.uuid != 'undefined' && req.params.uuid.length > 0) {
        clients.add(channel, req.params.uuid);
        response['channel'] = channel;
    } else {
        response['status'] = 'error';
        response['message'] = 'Missing uuid field';
    }
    res.end(JSON.stringify(response));
});
// endpoint for reply.ai responses
dispatcher.onPost('/webhook', function (req, res) {
    if (typeof req.params.contact_urn != 'undefined') {
        var client = clients.getClientByUuid(req.params.contact_urn);
        if (client != false) {
            console.log('Received for ->', client.uuid, client.channel);
            client.connection.send(JSON.stringify(req.params));
        } else {
            console.log('Received offline message for %s ', req.params.contact_urn);
            clients.saveMessage(req.params);
        }
    }
    res.end();
});
// endpoint for requests list of today tounaments
dispatcher.onGet("/tournaments", function (req, res) {
    console.log("tournaments request");
    var today = new Date();
    var beginDateRange = new Date(today.getFullYear(), today.getMonth(), today.getDate(), settings.dateOffset, 0, 0);
    var endDateRange = new Date(today.getFullYear(), today.getMonth(), today.getDate(), (parseInt(23) + parseInt(settings.dateOffset)), 59, 59);
    res.writeHead(200, {'Content-Type': 'application/json'});
    var cursor = clients.db.collection(clients.tournamentCollection)
        .find({date: {$lte: endDateRange, $gte: beginDateRange}},{ _id: 0 });
        cursor.toArray(function (err, tournaments) {
            res.end(JSON.stringify(tournaments));
            cursor.close();
        });
});
// endpoint for today races
dispatcher.onGet("/todayraces", function (req, res) {
    console.log("today races request");
    var today = new Date();
    var beginDateRange = new Date(today.getFullYear(), today.getMonth(), today.getDate(), settings.dateOffset, 0, 0);
    var endDateRange = new Date(today.getFullYear(), today.getMonth(), today.getDate(), (parseInt(23) + parseInt(settings.dateOffset)), 59, 59);
    res.writeHead(200, {'Content-Type': 'application/json'});
    clients.db.collection(clients.racesCollection)
        .find({datetime: {$lte: endDateRange, $gte: beginDateRange}}).toArray(function (err, races) {
            races = mongoCollectionToAssociativeArray(races, 'race_id');
            clients.db.collection(clients.tipsCollection)
                .find().toArray(function (err, tips) {
                    for (var i in tips) {
                        var tip = tips[i];
                        if(typeof races[tip['race_id']] != 'undefined'){
                            races[tip['race_id']]['tip'] = tip['tip'];
                        }
                    }
                    res.end(JSON.stringify(races));
                });
        });
});
server.listen(settings.httpServerPort, function () {
    console.log('Listening %s', settings.httpServerPort);
});

//websocket server initialization
new WebSocketServer({
    httpServer: server
})
    .on('request', function (req) {
        //request received
        var chanName = req.resourceURL.href.replace('/', '');
        if (!clients.checkChannel(chanName)) {
            //client with this channel not registered -> 404
            console.log('Connection rejected remote ip: %s, channel: %s', req.remoteAddress, chanName);
            req.reject(404, 'Invalid channel');
        } else {
            console.log('User connected channel: %s', chanName);
            var connection = req.accept(null, req.origin);
            connection['channel'] = chanName;
            var uuid = clients.saveConnection(chanName, connection);
            //sending messages that was received from reply.ai when user was offline
            clients.sendPendingMessages(uuid, function (document) {
                var client = clients.getClientByUuid(uuid);
                if (client != false) {
                    client.connection.send(JSON.stringify(document['message']));
                    console.log(document._id);
                    clients.db.collection(clients.pengingMessagesCollection)
                        .deleteOne({"_id": document._id})
                }
            });

            connection.on('message', function (message) {
                //message received in websocket
                var errorMsg = "";
                console.log('Message received in channel: %s', chanName);
                if (message.type === 'utf8') {
                    console.log("===============");
                    console.log(message.utf8Data);
                    console.log("===============");
                    var json = clients.getMessage(message.utf8Data);
                    if (json != undefined) {
                        //message is json
                        if (typeof json["text"] != "undefined" && typeof json["uuid"] != "undefined" && json["text"] != '' && json["uuid"] != '') {
                            //message have correct format
                            console.log('Request from %s with message "%s"', json.uuid, json.text);
                            //sending request to reply.ai
                            clients.makeRequest(json.uuid, json.text);
                        } else {
                            errorMsg = "Invalid message params";
                            console.log(errorMsg);
                        }
                    } else {
                        //message if not json object
                        errorMsg = "Invalid json format";
                        console.log(errorMsg);
                    }
                }
                if (errorMsg != "") {
                    connection.send(JSON.stringify({"error": errorMsg}));
                }
            });
            connection.on('close', function (code, reason) {
                clients.removeConnection(connection['channel']);
                console.log('connection closed %s: %s', code, reason);
                console.log('remove channel %s', connection['channel']);
            });
        }
    });
//
function mongoCollectionToAssociativeArray(collection, fieldName) {
    var result = {};
    for (var i=0; i<collection.length; i++) {
        var item = collection[i];
        if(typeof item[fieldName] != 'undefined') {
            result[item[fieldName]] = item;
        }
    }
    return result;
}