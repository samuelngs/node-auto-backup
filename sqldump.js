'use strict';
 
var spawn        = require('child_process').spawn;
var UploadStream = require('s3-stream-upload');
var AWS          = require('aws-sdk');
var Promise      = require('bluebird');
var async        = require('async');
var colors       = require('colors');
var moment       = require('moment');
var fs           = require('fs');
var config       = require('./config');


AWS.config.accessKeyId = config.aws.accessKey;
AWS.config.secretAccessKey = config.aws.secretKey;

var S3           = AWS.S3;

var SQLDump = function() {
	async.each(config.servers, function(dbConfig, next) {
		SQLHelper(dbConfig, next);
	}, function(err) {
		if (err) console.error(String(err).red);
		if (!err) console.log('--- All tasks completed ---'.green)
	});
};

var SQLHelper = function(dbConfig, next) {

 	var s3 = new S3();

	async.each(dbConfig.db_list || ['--all-databases'], function(database, complete) {

		var key = '[' + dbConfig.db_name + '] ' + (database === '--all-databases' ? 'full' : database) + '-' + moment().format('YYYY-MM-DD-HH-mm-ss') + '.sql';
		
		console.log(('[backup] `' + key + '` running...').yellow)

		var args = [
			'-P', dbConfig.db_port || '3306',
			'-h', dbConfig.db_host || 'localhost',
			'-u', dbConfig.db_user,
			'-p' + dbConfig.db_pass,
			database
		];

		var mysqldump = spawn('mysqldump', args);

		async.parallel([
			function(done) {
				new Promise(function(resolve, reject) {
					mysqldump
						.stdout
						.pipe(UploadStream(s3, { 
							Bucket: config.aws.bucket.name,
							Key: key 
						}))
						.on('chunk-uploaded', function() {
							console.log(('[backup] `' + key + '` uploading to s3...').cyan)
						})
						.on('finish', function() {
							resolve();
							done();
						})
						.on('error', function(err) {
							reject(err);
							done(err);
						});
				});
			},
			function(done) {
				new Promise(function(resolve, reject) {
					var outputStream = fs.createWriteStream(__dirname + '/backup/' + key, {flags: 'w'});
					mysqldump
						.stdout
						.pipe(outputStream)
						.on('drain', function() {
							console.log(('[backup] `' + key + '` saving to file...').cyan)
						})
						.on('finish', function() {
							resolve();
							done();
						})
						.on('error', function(err) {
							reject(err);
							done(err);
						});
				});
			}
		], function(err) {
			console.log(('[backup] `' + key + '` finished...').green)
			complete(err);
		});
 	}, function(err) {
 		next(err);
 	});

};
 
module.exports = SQLDump;