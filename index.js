var kue = require('kue')
    , cluster = require('cluster')
    , jobs = kue.createQueue();
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

    jobs.process('Image Conversion', 2, function (job, done) {
        var fileInfo = job.data.data;
        var infile = fileInfo.infile;
        var outfile = fileInfo.outfile;

        debug("job process " + fileInfo.infile);

        exec(makeConvertCommand(infile, outfile), function(err, data){
            job.progress(1, 3);
            exec(makeConvertCommand(outfile, outfile), function(err, data){
                job.progress(2, 3);
                exec(makeConvertCommand(outfile, outfile), function(err, data){
                    job.progress(3, 3);
                    done();
                });
            });
        });

    });
}

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

function createImageProcessingJobs(){
    getFileList().then(
        function(){
            debug(filesToProcess.length);
            filesToProcess.forEach(function(file){
                debug(file.infile);
                var job = jobs.create('Image Conversion', {
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

function convertFile(infile, outfile) {
	exec(makeConvertCommand(infile, outfile), function(err, data){
		exec(makeConvertCommand(outfile, outfile), function(err, data){
			exec(makeConvertCommand(outfile, outfile), function(err, data){
			});
		});
	});
}

function makeConvertCommand(infile, outfile){
    /*
     convert 7_right.jpeg -trim -resize 100x100  -channel G -separate out/7_right_a.png
     convert out/7_right_a.png -trim -resize 100x100  -channel G -separate  out/7_right_b.png
     */
    // crop black bars for usable areas of image
    // drop red and blue channels
    // resize to 100x100 ( constrain proportions)
	return "convert " + infile + " -trim -resize 100x100  -channel G -separate " + outfile;
}
// Loop through images

