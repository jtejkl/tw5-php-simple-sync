/*\
title: $:/plugins/phpsimplesync/syncadaptor.js
type: application/javascript
module-type: syncadaptor
A sync adaptor module for synchronising with php scripts and .Tid files.
\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

function phpsimplesync(options) {
	this.logger = new $tw.utils.Logger("phpsimplesync");

}

phpsimplesync.prototype.isReady = function() {
	return true;
};

phpsimplesync.prototype.getTiddlerInfo = function(tiddler) {
	return {title: tiddler.title} ;
};


var firstSkinnyLoad = true; 

var lastLoads = new Object(); 

var lastSkinnyLoad = "Tue, 15 Nov 1994 08:12:31 GMT"

var skippedDrafts = {};

/*
Get an array of skinny tiddler fields from the server
*/
phpsimplesync.prototype.getSkinnyTiddlers = function(callback) {
	var self = this;
	$tw.utils.httpRequest({
		url: "getSkinnyTiddlers.php",
				headers: {
		"If-Modified-Since": lastSkinnyLoad 
		}, 
		callback: function(err,data) {
		   
		    if(err=="XMLHttpRequest error code: 304") {
		    return callback(null, []);
		    
		    } 
		
			// Check for errors
			if(err) {
				return callback(err);
			}
			// Process the tiddlers to make sure the revision is a string
			var tiddlers = JSON.parse(data);

			for(var t=0; t<tiddlers.length; t++) {
				tiddlers[t] = self.convertTiddlerFromTiddlyWebFormat(tiddlers[t]);
                                
			}

                          
			// Invoke the callback with the skinny tiddlers
			callback(null,tiddlers);
			
			/// send tm-home if first skinny load
			
			if (firstSkinnyLoad) {	   
			
			   $tw.rootWidget.dispatchEvent({
	         	type: "tm-home"
               });
               
               
			   firstSkinnyLoad = false; 
			} 
			
			var now = new Date();
			
			lastSkinnyLoad = now.toUTCString();
			
			
		}
	});
};

/*
Save a tiddler and invoke the callback with (err,adaptorInfo,revision)
*/
phpsimplesync.prototype.saveTiddler = function(tiddler,callback) {
	var self = this;
	
	var isDraft = tiddler.fields["draft.of"] != null;
	
  // Avoid saving StoryList and drafts
  if (tiddler.fields.nosync || isDraft || tiddler.fields.title == "$:/StoryList") {
    // Remember drafts so we can skip deleting them
    if (isDraft) {  	
      skippedDrafts[tiddler.fields.title] = true;
    }
    
	  callback(null);
	  return
	} 
	
	
	$tw.utils.httpRequest({
		url:  "saveTiddler.php?tiddler="+ encodeURIComponent(tiddler.fields.title),
		type: "PUT",
		headers: {
			"Content-type": "application/json"
		},
		data: this.convertTiddlerToTiddlyWebFormat(tiddler),
		callback: function(err,data,request) {
			if(err) {
				return callback(err);
			}

			// Invoke the callback
			callback(null);
		}
	});
	

};

/*
Load a tiddler and invoke the callback with (err,tiddlerFields)
*/
phpsimplesync.prototype.loadTiddler = function(title,callback) {
	var self = this;
	
	if (title == "$:/StoryList") {
	    callback(null);
	    	    return
	  } 
	  
	  if(!lastLoads[title]) {
	   lastLoads[title] = "Tue, 15 Nov 1994 08:12:31 GMT"; 
	  } 
	
	$tw.utils.httpRequest({
		url: "loadTiddler.php?tiddler="+ encodeURIComponent(title),
		headers: {
		"If-Modified-Since": lastLoads[title] 
		}, 
		callback: function(err,data,request) {
		    
		    if(err=="XMLHttpRequest error code: 304") {
		    return callback(null);
		    
		    } 
		
			if(err) {
				return callback(err);
			}
            
                              
			// Invoke the callback
			callback(null,self.convertTiddlerFromTiddlyWebFormat(JSON.parse(data)));
			
			var now = new Date();
			
			lastLoads[title] = now.toUTCString();
		}
	});
};

/*
Delete a tiddler and invoke the callback with (err)
options include:
tiddlerInfo: the syncer's tiddlerInfo for this tiddler
*/
phpsimplesync.prototype.deleteTiddler = function(title,callback,options) {
	var self = this;

	// Draft which was not saved does not have to be deleted
  if (skippedDrafts[title]) {
    delete skippedDrafts[title];
    callback(null);
    return
  } 


	// Issue HTTP request to delete the tiddler
	$tw.utils.httpRequest({
		url: "deleteTiddler.php?tiddler="+ encodeURIComponent(title),
		
		callback: function(err,data,request) {
			if(err) {
				return callback(err);
			}
			// Invoke the callback
			callback(null);
		}
	});
	

};

/*
Convert a tiddler to a field set suitable for PUTting to TiddlyWeb
*/
phpsimplesync.prototype.convertTiddlerToTiddlyWebFormat = function(tiddler) {
	var result = {},
		knownFields = [
			"bag", "created", "creator", "modified", "modifier", "permissions", "recipe", "revision", "tags", "text", "title", "type", "uri"
		];
	if(tiddler) {
		$tw.utils.each(tiddler.fields,function(fieldValue,fieldName) {
			var fieldString = fieldName === "tags" ?
								tiddler.fields.tags :
								tiddler.getFieldString(fieldName); // Tags must be passed as an array, not a string

			if(knownFields.indexOf(fieldName) !== -1) {
				// If it's a known field, just copy it across
				result[fieldName] = fieldString;
			} else {
				// If it's unknown, put it in the "fields" field
				result.fields = result.fields || {};
				result.fields[fieldName] = fieldString;
			}
		});
	}
	// Default the content type
	result.type = result.type || "text/vnd.tiddlywiki";
	return JSON.stringify(result,null,$tw.config.preferences.jsonSpaces);
};

/*
Convert a field set in TiddlyWeb format into ordinary TiddlyWiki5 format
*/
phpsimplesync.prototype.convertTiddlerFromTiddlyWebFormat = function(tiddlerFields) {
	var self = this,
		result = {};
	// Transfer the fields, pulling down the `fields` hashmap
	$tw.utils.each(tiddlerFields,function(element,title,object) {
		if(title === "fields") {
			$tw.utils.each(element,function(element,subTitle,object) {
				result[subTitle] = element;
			});
		} else {
			result[title] = tiddlerFields[title];
		}
	});
	// Make sure the revision is expressed as a string
	if(typeof result.revision === "number") {
		result.revision = result.revision.toString();
	}
	// Some unholy freaking of content types
	if(result.type === "text/javascript") {
		result.type = "application/javascript";
	} else if(!result.type || result.type === "None") {
		result.type = "text/x-tiddlywiki";
	}
	return result;
};






	exports.adaptorClass = phpsimplesync;


})();
