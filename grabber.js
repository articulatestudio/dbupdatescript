const CronJob = require('cron').CronJob;
const g2 = require('./g2');
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
