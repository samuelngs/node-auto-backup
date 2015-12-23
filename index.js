
'use strict';
 
var sqldump    = require('./sqldump');
var config     = require('./config');
var schedule   = require('node-schedule');

schedule.scheduleJob('30 2 * * *', sqldump);
