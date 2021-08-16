// BeatMarker,
// an Adobe Extension that marks important audio events in the timeline
// Copyright (C) 2021  Accusonus, Inc.
// 17 Carley Road, Lexington, MA 02421, USA

// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.


$._BDP_={
    lastSelectedAudioFile : [],
    
    audioFilePath : "",
    
    audioFiles : [],
    
    undoArray : [],

    foundInBins : null,

    // Helper function that creates a sequence
    createSequence : function(sequenceName) 
    {
        var someID	= "xyz123";
        return app.project.createNewSequence(sequenceName, someID);
    },

    // Setter for the audio file field
    setAudioFile : function(audioPath)
    {
        this.audioFilePath = audioPath;
    },

    // Getter for the undo steps available
    getUndoSteps: function()
    {
        return this.undoArray.length;
    },

    // Setter for the lastSelectedAudioFile field
    setSelectedAudioFile: function(name, mediaPath, treePath)
    {
        this.lastSelectedAudioFile = [name, mediaPath, treePath]
    },

    // Method that verifies the validity of a project item and then sets it as the selected one if it is valid
    checkSelectionValidity : function(projectItem, found, isSelected) 
    {
        var mediaPath = projectItem.getMediaPath();
        // Guard for all invalid cases
        if (!found || !projectItem.type == 1){

            this.setSelectedAudioFile("invalid","invalid","invalid")
            return;

        }

        if (isSelected){
            // This should only occur if the current track is selected
            this.setSelectedAudioFile(projectItem.name,mediaPath,projectItem.treePath);
        }
    },

    /** 
     * Callback function for when the timeline selection changes. Unfortunately
     * JSX does not give us an event object on this one
     */
    activeSequenceSelectionChanged : function ()
    {

        var seq = app.project.activeSequence;
        var found = false;
        if (seq){
            var numTracks = seq.audioTracks.numTracks;
            // Iterate over audioTracks 
            for (var track = 0; track < numTracks; track++){
                var currentTrack = seq.audioTracks[track];
                var numClips = currentTrack.clips.numItems;
                // Iterate over inserted clips
                for (var clip = 0; clip < numClips; clip++){
                    var currentClip = currentTrack.clips[clip];
                    var projItemReferenced = currentClip.projectItem;
                    if (currentClip.isSelected()){
                        found = true;
                    }
                    // Call the selection validity setter with the parameters
                    var isSelected = currentClip.isSelected();
                    $._BDP_.checkSelectionValidity(projItemReferenced, found, isSelected);
                }
            }        
        }
    },

	projectPanelSelectionChanged : function (eventObj) 
    {
        // Note: This message is also triggered when the user opens or creates a new project. 
		var projectItems	= eventObj;
		if ((!projectItems)||(!projectItems.length))
        {
            return;
		} 

        for (var i = 0; i < projectItems.length; i++)
        {   
            // Check if the event trigger is valid 
            $._BDP_.checkSelectionValidity(projectItems[i], true, true);
        }
	},

    getLastSelectedFile : function() 
    {
        return this.lastSelectedAudioFile;
    },
    
    registerActiveSequenceSelectionChangedFxn : function () 
    {
		app.bind("onActiveSequenceSelectionChanged", this.activeSequenceSelectionChanged);
	},

    registerProjectPanelSelectionChangedFxn : function () 
    {
		app.bind("onSourceClipSelectedInProjectPanel", this.projectPanelSelectionChanged);
	},


    createMarkers : function(beatEvents, systemImport, sequenceName, filePath, treePath) {
        /** This function checks wether the file was imported through the system 
        *   or from inside the project and calls the marker generation function for each case
        */
        var foundInSeq = false;
        /** Search wether the file is used in a seuqence
        *   if so, create markers at that point in time; else, import it.
        */
        var numSeq = app.project.sequences.numSequences;

        // Iterate over all sequences
        for (var seq = 0; seq < numSeq; seq++)
        {
            var currentSeq = app.project.sequences[seq];
            var numTracks = currentSeq.audioTracks.numTracks;
            // Iterate over audioTracks 
            for (var track = 0; track < numTracks; track++)
            {
                var currentTrack = currentSeq.audioTracks[track];
                var numClips = currentTrack.clips.numItems;
                // Iterate over inserted clips
                for (var clip = 0; clip < numClips; clip++)
                {
                    var currentClip = currentTrack.clips[clip];
                    var clipPath = currentClip.projectItem.getMediaPath();
                    // Alter the filepath string to match the MediaPath string
                    filePath = filePath.replace(/\"/g,"");
                    clipPath = clipPath.replace(/\\/g,"/");
                    if (clipPath == filePath)
                    {
                        // If a clip is found find its in and out points and create markers accordingly
                        foundInSeq = true;
                        var clipStart = currentClip.start.seconds;
                        var clipEnd = currentClip.end.seconds;
                        var inPoint = currentClip.inPoint.seconds;
                        this.createMarkersFromArray(currentSeq, 
                                                    currentSeq.name,
                                                    beatEvents,
                                                    clipStart, 
                                                    inPoint, 
                                                    clipEnd);
                        // Take user to one of the sequences with the newly created markers
                        app.project.activeSequence = currentSeq;
                    }
                }
            }
        }

        // If the clip was found, return
        if (foundInSeq)
        {
            return true;
        }

        // If the clip was not found inside a sequence and it was imported through the system
        if (!systemImport)
        {
            // Iterate over project items and search, then import that file
            /** First set the root item to be the project root and extract the 
                individual names of the file path 
                i.e. 'bin1/audio.wav' --> ['bin1', 'audio']
            */
            var tree = treePath.split("/");
            var root = app.project.rootItem;
            // Iterate over name arrays
            for (var i = 0; i < tree.length; i++){
                // Iterate over items in this bin
                for (var j = 0; j < root.children.numItems; j++){
                    /** If the name of current item matches the current key,
                        set it as the new root
                    */
                    if (root.children[j].name == tree[i]){
                        root = root.children[j];
                        break;
                    }
                }
            }

            /** After the algorithm runs, root is the projectItem that has a name
                matching the last element of the tree array
            */
            // Create a new Sequence
            if(!this.createSequence("NEW_SEQUENCE"))
            {
                return false;
            }

            // Insert the new Clip
            app.project.activeSequence.audioTracks[1].insertClip(root, 0);

            this.createMarkersFromArray(app.project.activeSequence, 
                                        sequenceName,
                                        beatEvents,
                                        0, 0, 0);

            // Exit the function
            return true;
        }

        // If the file was imported from the project
        this.foundInBins = false;
        var root = app.project.rootItem;
        var thisFilepath = filePath.replace(/\"/g,"");
        thisFilepath = thisFilepath.replace(/\\/,"/");

        this.searchForFile(root, thisFilepath);
        // If the item was not found in the project bins
        if (!this.foundInBins)
        {
            /// If the file was imported from the system create a new sequence and create markers  
            // First Create a new Sequence 
            if(!this.createSequence("NEW_SEQUENCE")){
                return false;
            }

            var newSeq = app.project.activeSequence;
            // Import file into project's root bin/directory
            app.project.importFiles(this.audioFilePath, false, app.project.rootItem);

            var numItemsInProject = app.project.rootItem.children.numItems;
            
            // The audio file is the last imported file in the project
            var audioFileProjectItem = app.project.rootItem.children[numItemsInProject - 1];
            newSeq.audioTracks[1].insertClip(audioFileProjectItem, 0);
            this.createMarkersFromArray(newSeq, 
                                        sequenceName,
                                        beatEvents, 
                                        0, 0, 0);
                                        // Exit the function
            return true;
        }
        
        // If none of the above conditions are met, we import the file from the project bin

        if(!this.createSequence("NEW_SEQUENCE"))
        {
            return false;
        }
        
        // Insert the new Clip
        app.project.activeSequence.audioTracks[1].insertClip(this.foundInBins, 0);

        this.createMarkersFromArray(app.project.activeSequence, 
                                    sequenceName,
                                    beatEvents,
                                    0, 0, 0);
        return true;

  

    },

    createMarkersFromArray : function(sequence, sequenceName, beatEvents, clipStart, inPoint, clipEnd) {
        var newMarkerEvent = [];
        var colour = 6 // Blue 
        // get seconds per frame from sequence in order to quantize beat times to frames 
        // 254016000000 is total 'ticks' every second for Premiere
        // sequence.timebase returns 'ticks' per frame for the given sequence
        var secPerFrame = sequence.timebase / 254016000000;
        for (iBeat = 0; iBeat < beatEvents.length; iBeat++) {
            var beatSecond = beatEvents[iBeat];
            var startSecond = 0;
            // First check if our marker second is in the clip's range
            if (beatSecond >= inPoint){
                // Create a displacement so that the marker does not reference start of the timeline but start of clip
                // displacement can be negative (e.g. clip trimmed from the left and moved closer to the start of the timeline)
                var displacement = clipStart - inPoint;
                startSecond = beatSecond + displacement;
                // round to the nearest frame
                var startFrame = Math.round(startSecond / secPerFrame) * secPerFrame;
                // Check if our marker is out of the clip's range
                if ((startFrame >= clipEnd) && (clipEnd > 0)){
                    continue;
                }
                // Marker creation
                var newMarker = sequence.markers.createMarker(startFrame);
                newMarkerEvent.push(newMarker.guid);
                newMarker.end = startFrame;
                newMarker.setColorByIndex(colour, iBeat);
            }
            // Check wether clip has ended (outPoint = 0 means that the clip was not found in the timeline)
       }
       this.undoArray.push(newMarkerEvent);
       sequence.name = sequenceName;
    },

    /** 
     * Method that removes the markers stored in the undo array 
     */
    undoMarkers : function(){
        if (!this.undoArray.length){
            return;
        }
        var lastMarkerEvent = this.undoArray.pop();
        var numSeq = app.project.sequences.numSequences;
        // Iterate over all sequences (we only apply markers to sequences)
        for (var seq = 0; seq < numSeq; seq++){
            var currentSeqMarkers = app.project.sequences[seq].markers;
            var numMarkers = currentSeqMarkers.numMarkers;
            var index = 0;
            while (index < numMarkers){
                var currentMarker = currentSeqMarkers[index];
                var currentGUID = currentMarker.guid;
                for (var marker=0; marker<lastMarkerEvent.length;marker++){
                    var guidToUndo = lastMarkerEvent[marker]; 
                    if(guidToUndo  == currentGUID){
                        currentSeqMarkers.deleteMarker(currentMarker);
                        // Account for the deletion of the marker
                        index -= 1;
                        numMarkers -= 1;
                        break
                    }
                }
                index += 1;
            }
        }
    },

    getDropdownFiles : function() {
        // Initiate the DFS by setting rootItem as starting node
        this.audioFiles.length = 0;
        this.getAudioFiles(app.project.rootItem);
        return this.audioFiles;
    },
    
    searchForFile : function(node, filepath){
        //Check if node is a bin or root
        if (node.type == 2 || node.type== 3) {
            var numItems = node.children.numItems;
            for (var index = 0; index < numItems; index++){
                var myItem = node.children[index];
                // Recursively call the function
                this.searchForFile(myItem, filepath);
            }
            return;
        } else {
            /** If the current node is a leaf, check for filename 
            */
            var nodePath = node.getMediaPath();
            nodePath = nodePath.replace(/\\/g, "/");
            if (nodePath == filepath){
                this.foundInBins = node;
                return;
            }
        } 
    },

    // Runs a search through the project tree and searches for audio files
    getAudioFiles : function(node) {
        //Check if node is a bin or root
        if (node.type == 2 || node.type== 3) {
            var numItems = node.children.numItems;
            for (var index = 0; index < numItems; index++){
                var myItem = node.children[index];
                // Recursively call the function
                this.getAudioFiles(myItem);
            }
            return;
        } else {
            /** If the current node is a leaf, check for filetype
                and add it to the list
            */
            var fileExtension = node.getMediaPath().split('.').pop();
            if (fileExtension.toUpperCase() == "WAV" || fileExtension.toUpperCase() == "MP3" ){
                /** Extract the name of the file and the directory it's contained in,
                *   excluding the root directory (project name + \)
                */
                nameWithPath = node.treePath.split(app.project.name + '\\').pop();
                var nodeInfo = [nameWithPath, node.getMediaPath()]; 
                this.audioFiles.push(nodeInfo);
            }
            return;
        }       
    }
};
