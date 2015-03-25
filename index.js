var kue = require('kue')
    , cluster = require('cluster')
    , queue = kue.createQueue(
        {redis: {
        host: '192.168.1.179',
        options: {}
        // see https://github.com/mranney/node_redis#rediscreateclient
    }}
    );
var numCPUs = require('os').cpus().length;
var exec = require('child_process').exec;
var debug = require("debug")("app")
var fs = require("fs");

var events = require('events');
var Event = new events.EventEmitter();

var Q = require("Q");

var inpath = "/Volumes/ML/train";
var outpath = "/Volumes/ML/train/out";

var filesToProcess = [];

if (cluster.isMaster) {

    kue.app.listen(3000);
    //createImageProcessingJobs();

    // Fork workers.
    debug("numCPUs: " + numCPUs);
    for (var i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', function(worker, code, signal) {
        console.log('worker ' + worker.process.pid + ' died');
    });
} else {

    debug('I am worker #' + cluster.worker.id);
    queue.process('Image Conversion', 1, function (job, done) {
        debug("job process " + job.data.data.infile);
        cropAndResize(job.data.data.infile, job.data.data.outfile, job, done);
    });
}

/****
 * Workflow for crop and resize
 * @param infile
 * @param outfile
 * @param job
 */
function cropAndResize(infile, outfile, job, done) {
    exec(makeTilesFromImage(infile, outfile), function(err, data){
        job.progress(1, 3);
        exec(makeConvertCommand(infile, outfile), function(err, data){
            job.progress(2, 3);
            exec(makeConvertCommand(outfile, outfile), function(err, data){
                job.progress(3, 3);
                done();
            });
        });
    });
}

/**
 * Get list of files to work on
 * @returns {*}
 */
function getFileList() {
    var deferred = Q.defer();
    // Read the directory
    fs.readdir(inpath, function (err, list) {
        for(var i = 0; i<list.length; i++) {
            var file = list[i];
            var infile = inpath + "/" + file;
            var outfile = outpath + "/" + file;
            filesToProcess.push({infile: infile, outfile: outfile});
        }
        deferred.resolve(filesToProcess);
    });
    return deferred.promise;
}

/***
 * Make Jobs from datasource
 */
function createImageProcessingJobs(){
    getFileList().then(
        function(){
            debug(filesToProcess.length);
            filesToProcess.forEach(function(file){
                debug(file.infile);
                var job = queue.create('Image Conversion', {
                    title: 'Convert: ' + file.infile, data:file
                    , user: 1
                });

                job.on('complete', function(result) {
                    console.log("Job for " + file.infile + " completed");
                }).on('failed', function(){
                    console.log("Job failed");
                }).on('progress', function(progress){
                    process.stdout.write('\r  job #' + job.id + ' ' + progress + '% complete');
                });
                job.save();
            });
        }
    );
}

function makeTilesFromImage(x, y, file, out) {
    return "convert -crop "+x+"x"+y +"@ "+file+"  " + out + "%d.png";
}
/**
 * Generate Commands from a string
 * @param infile
 * @param outfile
 * @returns {string}
 */
function makeConvertCommand(infile, outfile){
    // crop black bars for usable areas of image
    // drop red and blue channels
    // resize to 100x100 ( constrain proportions)
	return "convert " + infile + " -trim -channel G -separate " + outfile;
}
// Loop through images

