const CronJob = require('cron').CronJob;
const g2 = require('./g2');
const g3 = require('./g3');
// g2.run();

console.log('Starting worker - ', Date());

// Init cron to run grabber every minute
new CronJob(
  '* * * * *',
  function() {
    console.log('Starting task', Date());
    g2.run();
  },
  null,
  true
);

// Init cron to run grabber every minute
new CronJob(
  cronTime: '00 30 03 * * *',
  onTick: function() {
    console.log('Starting task', Date());
    g3.run();
  },
  null,
  true
);
