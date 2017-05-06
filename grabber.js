const CronJob = require('cron').CronJob;
const g2 = require('./g2');

// Init cron to run grabber every minute
new CronJob(
  '*/5 * * * *',
  function() {
    console.log('Starting task', Date());
    g2.run();
  },
  null,
  true
);
