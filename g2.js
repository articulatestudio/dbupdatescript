var { MongoClient } = require('mongodb');
var CronJob = require('cron').CronJob;
var http = require('http');
var parseString = require('xml2js').parseString;
var settings = require('./settings');

//list on mongodb collections
const tournamentCollection = 'tiptap_tournaments';
const racesCollection = 'tiptap_races';
const horsesCollection = 'tiptap_horses';
const oddsCollection = 'tiptap_odds';

module.exports = {
  run() {
    // load
    const promises = settings.xmlUrls.map(load);
    let finalData = {};
    Promise.all(promises)
      .then(results => {
        // parse
        finalData = results.reduce(
          (acc, data) => {
            return {
              tournaments: acc.tournaments.concat(data.tournaments),
              races: acc.races.concat(data.races),
              horses: acc.horses.concat(data.horses),
              odds: acc.odds.concat(data.odds)
            };
          },
          {
            tournaments: [],
            races: [],
            horses: [],
            odds: []
          }
        );
        return MongoClient.connect(settings.mongoUri);
      })
      // clean db
      .then(wipeDb)
      // save
      .then(db => {
        return storeData(db, finalData);
      })
      .then(db => {
        db.close();
      })
      .catch(console.error);
  }
};
function load(url) {
  return loadData(url).then(parseData).catch(console.error);
}
//save data in db
function storeData(db, data) {
  const options = { ordered: false };
  const ops = [
    db.collection(tournamentCollection).insertMany(data.tournaments, options),
    db.collection(racesCollection).insertMany(data.races, options),
    db.collection(horsesCollection).insertMany(data.horses, options),
    db.collection(oddsCollection).insertMany(data.odds, options)
  ];
  return Promise.all(ops).then(() => {
    return db;
  });
  return db;
}
//clean db
function wipeDb(db) {
  const ops = [
    db.dropCollection(tournamentCollection).catch(() => {}),
    db.dropCollection(horsesCollection).catch(() => {}),
    db.dropCollection(oddsCollection).catch(() => {}),
    db.dropCollection(racesCollection).catch(() => {})
  ];
  return Promise.all(ops).then(() => {
    return db;
  });
}
// load data from xml to json
function loadData(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, function(res) {
        var data = '';
        res
          .on('data', function(chunk) {
            data += chunk;
          })
          .on('end', function() {
            parseString(data, function(err, data) {
              if (err) throw err;
              resolve(data);
            });
          });
      })
      .on('error', function(e) {
        reject(e);
      });
  });
}

function parseData(json) {
  if (
    json.hasOwnProperty('scores') && json.scores.hasOwnProperty('tournament')
  ) {
    const tournaments = json.scores.tournament;
    const tournamentsToSave = [];
    const racesToSave = [];
    let horsesToSave = [];
    let oddsToSave = [];

    for (var tournamentsCounter in tournaments) {
      var tournament = tournaments[tournamentsCounter];
      if (tournament.hasOwnProperty('race')) {
        tournamentsToSave.push(getTournament(tournament.$));
        const tournamentId = tournament.$.id;
        const tournamentName = tournament.$.name;
        var races = tournaments[tournamentsCounter].race;

        for (var racesCounter in races) {
          var race = races[racesCounter];
          var raceId = race.$.id;
          const raceName = race.$.name;
          var activeRacesCount = 0;

          if (isActiveRace(race)) {
            console.log('Saving race %d ', raceId);
            activeRacesCount++;
            racesToSave.push(getRace(race.$, tournamentId));
            oddsToSave = oddsToSave.concat(
              getOdds(race.odds, tournamentId, raceId, tournamentName, raceName)
            );
            horsesToSave = horsesToSave.concat(
              getHorses(race.runners, tournamentId, raceId)
            );
          } else {
            console.log('Race %d ', raceId, ' ended');
          }
        }
        if (activeRacesCount == 0) {
        }
      }
    }
    return {
      tournaments: tournamentsToSave,
      races: racesToSave,
      horses: horsesToSave,
      odds: oddsToSave
    };
  } else {
    console.log('not valid json schema');
    return {
      tournaments: [],
      races: [],
      horses: [],
      odds: []
    };
  }
}

function getTournament(tournamentData) {
  return {
    tournament_id: tournamentData['id'],
    name: tournamentData['name'],
    date: parseDate(tournamentData['date']),
    going: tournamentData['going']
  };
}

function getRace(raceData, tournamentId) {
  return {
    tournament_id: tournamentId,
    race_id: raceData['id'],
    name: raceData['name'],
    distance: raceData['distance'],
    class: raceData['class'],
    time: raceData['time'],
    offAt: raceData['offAt'],
    datetime: parseDate(raceData['datetime'])
  };
}

function getOdds(oddsData, tournament_id, race_id, tournament_name, race_name) {
  if (typeof oddsData != 'undefined') {
    var oddsList = oddsData[0];
    const odds = [];
    if (typeof oddsList != 'undefined') {
      oddsList = oddsList.horse;
      for (var oddsCounter in oddsList) {
        var odd = oddsList[oddsCounter].$;
        var oddData = {
          tournament_id,
          tournament_name,
          race_name,
          race_id,
          horse_number: odd.number,
          horse_name: odd.name,
          horse_id: odd.id,
          wagers: []
        };
        var bookmakers = oddsList[oddsCounter].bookmakers;
        var wagers = [];
        if (typeof bookmakers != 'undefined') {
          bookmakers = bookmakers[0];
          if (bookmakers.hasOwnProperty('bookmaker')) {
            bookmakers = bookmakers.bookmaker;
            for (var wagersCounter in bookmakers) {
              if (bookmakers[wagersCounter].hasOwnProperty('$')) {
                var wager = bookmakers[wagersCounter]['$'];
                wagers.push(wager);
              }
            }
          }
        }
        if (wagers.length > 0) {
          oddData.wagers = wagers;
        }
        odds.push(oddData);
      }
      return odds;
    }
  } else {
    console.log('Empty odds data');
    return [];
  }
}

function getHorses(horsesList, tournamentId, raceId) {
  if (typeof horsesList != 'undefined') {
    horsesList = horsesList[0];
    const horses = [];
    if (typeof horsesList != 'undefined') {
      horsesList = horsesList['horse'];
      for (var i in horsesList) {
        if (horsesList[i].hasOwnProperty('$')) {
          var horse = horsesList[i].$;
          horses.push({
            tournament_id: tournamentId,
            race_id: raceId,
            number: horse['number'],
            name: horse['name'],
            age: horse['age'],
            weight: horse['wgt'],
            distance: horse['distance'],
            jockey: horse['jockey'],
            jockey_id: horse['jockey_id'],
            trainer: horse['trainer'],
            trainer_id: horse['trainer_id'],
            id: horse['id']
          });
        }
      }
      return horses;
    }
  } else {
    console.log('Empty horses list data');
    return [];
  }
}
function isActiveRace(race) {
  if (race.hasOwnProperty('odds')) {
    if (typeof race.odds[0] == 'string') {
      return false;
    }
  }
  return true;
}

function parseDate(dateString) {
  var minutes = (hours = 0);
  if (typeof withTime == 'undefined') {
    withTime = false;
  }
  var dateParts = dateString.split('.');
  if (typeof dateParts[2] != 'undefined' && dateParts[2].indexOf(':') >= 0) {
    var timeParts = dateParts[2].split(' ');
    dateParts[2] = timeParts[0];
    if (typeof timeParts[1] != 'undefined') {
      timeParts = timeParts[1].split(':');
      hours = timeParts[0];
      minutes = timeParts[1];
    }
  }
  return new Date(
    dateParts[2],
    dateParts[1] - 1,
    dateParts[0],
    parseInt(hours) + settings.dateOffset,
    minutes
  );
}
