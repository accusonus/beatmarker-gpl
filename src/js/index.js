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

// Check if user is already logged in
document.addEventListener('DOMContentLoaded', function(e) {
    if (typeof(Storage) !== "undefined") {
        checkConsent();

        if (localStorage.getItem("colorMode") === null) {
            localStorage.setItem("colorMode", "Default");
        }
    }

    themeInit();
    statusUser();
});

// Prevent default behavior for drop events for the whole html window
window.addEventListener("dragover", function(e){

    e.preventDefault();

}, false);

window.addEventListener("drop", function(e){

    e.preventDefault();

}, false);

window.onclick = function(event) {

    if (event.target.id== "about-modal") {
        closeAboutBox();
    }

    else if(event.target.id =="alert-modal"){
        closeAlertBox();
    }
}

const theme = window.getComputedStyle(document.querySelector(":root"));

/**
 * Import node modules
 */

const fs = require('fs');
const exec = require('child_process').exec;
const execSync = require('child_process').execSync;
const os = require('os');
const mimeLookup = require('mime-types').lookup;

/** 
 * Variable that checks wether the last imported file was through
 * the system import dialogue or from inside the project
 * 0 : Imported through Premiere Project
 * 1 : Imported from the filesystem
 */

/** Variable that checks wether the last imported file was through
*   the system import dialogue or from inside the project
*/
window.importedThroughSystem = 0;

// Variable to keep user choice on sending analytics data (opt-in)
window.analytics = false;

window.audioFile = {

    "fileName" : null,
    "filePath" : null,
    "treePath" : null,
    "originalName" : null,
    "originalPath" : null

}; // This object is global and accessible from every function.

// Global variables for system setup
window.OS = null;
window.extensionPath = null;
window.outputDir = null;
window.detectorLocation = null;
window.ffmpegLocation = null;

// Global variables for all beats, available beats in region and currently selected beats
window.allBeats = [];
window.availableBeats = [];
window.selectedBeats = [];

function getSystemSetup(){
    // Get system's username
    var localUserName = os.userInfo().username.toString();

    var csInterface = new CSInterface;
    var osVersion = csInterface.getOSInformation();
    
    window.extensionPath = csInterface.getSystemPath(SystemPath.EXTENSION);

    if (osVersion.indexOf("Mac") >= 0) {
        window.OS = "Mac";
        window.detectorLocation = '"' + window.extensionPath + "/ibt/ibt" + '"';
        window.ffmpegLocation = '"' + window.extensionPath + "/tools/ffmpeg/ffmpeg" + '"';
        window.licenserLocation = '"' + window.extensionPath + "/tools/licenser/Accusonus License Manager.app/Contents"
                                                             + "/MacOS/Accusonus\ License\ Manager" + '"'; 
        var outputDir = "/Users/userName/Library/Application Support/accusonus/BeatMarker/";
    }
    else if (osVersion.indexOf("Windows") >= 0) {
        window.OS = "Windows";
        window.detectorLocation = '"' + window.extensionPath + "/ibt/ibt.exe" + '"';
        window.ffmpegLocation = '"' + window.extensionPath + "/tools/ffmpeg/ffmpeg.exe" + '"';
        window.licenserLocation = '"' + window.extensionPath + "/tools/licenser/Accusonus License Manager.exe" + '"';
        var outputDir = "C:/Users/userName/AppData/Roaming/accusonus/BeatMarker/";
    }
    window.outputDir = outputDir.replace("userName", localUserName);
}


// Get random item from array
function getRandomItem(arr) {

    // get random index value
    const randomIndex = Math.floor(Math.random() * arr.length);

    // get random item
    const item = arr[randomIndex];

    return item;
}

// Reads the beats from the file
function readBeatsTxt(filename){

    const txtPath = window.outputDir + filename + '.txt';

    const powersTxtPath = window.outputDir + filename + '_power.txt';
    
    var lines = [];

    var data = fs.readFileSync(txtPath, 'utf-8');

    powerData = fs.readFileSync(powersTxtPath, 'utf-8');
    
    lines.push(data.split('\n')[0]);

    lines = lines.concat(data.match(/(.+? )/g));
    
    var powers = powerData.split('\n');
     
    var forSorting = [];
    for (var i = 0; i < lines.length; i++){

        forSorting.push({
            'time' : parseFloat(lines[i]),
            'energy' : parseFloat(powers[i])
        });

    }

    forSorting.sort((a,b)=>{

        if (a.energy < b.energy){
            return 1;
        } else if (a.energy == b.energy) {
            return 0;
        } else {
            return -1;
        }
        
    })

    for (var i = 0; i < lines.length; i++){
        lines[i] = forSorting[i].time;
    }

    return lines;
}

/**
 * Method that converts mp3 to wav
 */
function ffmpegToWAV(file){
   
    var filepath = file.path;

    var filename = file.name;

    var fileSplit = filename.split('.');

    fileSplit.pop();

    var fileNameOnly = fileSplit.join(".");

    var newFileName = fileNameOnly + ".wav";

    var newFilePath = window.outputDir + newFileName;

    // FFmpeg to convert all files to .wav / stereo -> mono
    const convertionCommand = window.ffmpegLocation + " -v fatal -y -i \""  + filepath + "\" -ac 1 -c:a pcm_s16le \"" + newFilePath + "\"";

    // Call the sync version of exec
    try {
        execSync(convertionCommand, {encoding: "UTF-8"});
    } catch (e) {
        return null;
    }
    
    // Store the new file parameters
    var newFile = {
        name : newFileName,
        path : newFilePath,
        treePath : file.treePath,
        oldName : file.name,
        oldFilePath : file.path
    }

    return newFile;
}

/*
 * Method that generates a BLOB from given filepath
 */

function blobFromPath(path){
    if (!fs.existsSync(path)){
        return null;
    }
    // Read the file data into a buffer
    var buff = fs.readFileSync(path);

    // Slice the buffer into an array
    let arrayBuff = buff.buffer.slice(buff.byteOffset, buff.byteOffset + buff.byteLength);

    // Construct the BLOB
    var blob = new Blob([arrayBuff]);
    return blob
}

function dragOverHandler(ev){
    ev.preventDefault();
    // On dragOver change the class (changes color)
    document.querySelector("#master-panel").classList.add('dragover');
}

function dragLeave(ev) {
    ev.preventDefault();
    if(ev.target.id == "drag-overlay"){
        // reset color if you leave the drop area
        document.querySelector("#master-panel").classList.remove('dragover');
    }
}

/**
 * Method that sets the UI to reflect the selected item from the 
 * dropdown menu and adds the selection class accordingly
 */
 function dropdownSelect(option){
    // If the current selection is clicked again, do nothing
    if(option.classList.contains('selected')){
        return
    }

    // If this option is not the currently selected one, set the UI to reflect the new choice
    var currentItemField = option.closest('.dropdown').querySelector('.dropdown-current span');

    currentItemField.textContent = option.textContent;

    currentItemField.setAttribute("title",option.textContent);

    let deselectItem =  option.parentNode.querySelector('.dropdown-option.selected');

    // If an element with the selection class exists, deselect it
    if(deselectItem){
        deselectItem.classList.remove('selected');
    }

    // Add the selection class to the clicked element
    option.classList.add('selected');
}

/**
 * Method that gets called when the user 
 * clicks the project imports dropdown
 */
function fileDropdownClickHandler(){

    const fileDropdown = document.getElementById('file-dropdown');

    if(!fileDropdown.classList.contains('open')){

        // Clear dropdown
        var selected = fileDropdown.querySelector('.selected');

        if(selected) {
            var isSelected = selected.getAttribute("title");
        } else {
            var isSelected = null;
        }

        fileDropdown.querySelector('.dropdown-options').textContent = '';

        /**
         * Populate dropdown with project files. 
         * Takes an optional parameter for a preselected item.
         */
        evalScript("$._BDP_.getDropdownFiles()", (data)=>{populateDropdown(data, isSelected)});

    }

    fileDropdown.classList.toggle('open');
    
}

/**
 * Method that handles the audio file data and populates 
 * the dropdown menu.
 * CSInterface returns a string of the following form
 * "name1,path1,name2,path2 ..." 
 */
function populateDropdown(data, preselected) {

    //CSInterface returns str instead of array
    items = data.split(",");
    var fileDropdown = document.querySelector("#file-dropdown .dropdown-options");

    // If there are no relevant project files add one disabled option
    if(items.length < 2){

        let option = document.createElement("span");

        option.classList.add("dropdown-option","disabled");

        option.textContent = "No files to select";

        fileDropdown.append(option);

    }

    for (var i = 0; i<items.length; i+=2){
        
        if (!items[i+1]){
            continue;
        }
     
        if (!mimeLookup(items[i+1]).startsWith("audio") && !mimeLookup(items[i+1]).startsWith("video")){
            continue;
        } 

        // Create the new menu option element
        let option = document.createElement("span");

        option.classList.add("dropdown-option");

        option.innerHTML = items[i].split("\\").slice(-1)[0];
        
        option.setAttribute("title", items[i]);

        // Add the onclick function
        option.onclick = function() {
            dropdownSelect(this);
            // Will trigger the file selection for the specific audio track
            selectFileFromDropdownHandler();
        }

        option.setAttribute("data-value",items[i+1]);
        fileDropdown.append(option);

        if(preselected){
            // Add style to the preselected option if it exists
            if(items[i].includes(preselected)){
                option.classList.add("selected");
            }
        }
    }
}

/**
 *  *************************************
 *          FILE IMPORT HANDLING  
 *  ************************************* 
 */

/**
 * Method that gets called when the user choses to import a 
 * file from their project through the UI dropdown element
 */
function selectFileFromDropdownHandler()
{
    // Set the import mode to Premiere Project
    window.importedThroughSystem = 0;

    // Reset the import from system 
    document.querySelector("#file-input").value = '';

    var selectedFile = document.querySelector("#file-dropdown .selected");

    // Generate a file object that mimics the global one
    var file = {
        "name" : selectedFile.innerText,
        "path" : selectedFile.getAttribute("data-value"),
        "treePath": selectedFile.getAttribute("title")
    };

    var type = 'Project';
    importFile(file,type);
}

/**
 * Method that gets called when the user imports a file through their filesystem
 * It distinguishes between drag/drop and import through file functionality
 */
function systemImportHandler(ev) 
{
    // If the file came from the Drag and Drop event
    if (ev.type == "drop"){

        document.querySelector("#master-panel").classList.remove("dragover");

        /**
         * If the file was not imported through the dataTransfer event, thus 
         * being the result of importing from Premiere.
         */
       if (!ev.dataTransfer.files.length){
            // File object that mimics the desired fields from dataTransfer object
            var file = {
                name :     "invalid",
                path :     "invalid",
                treePath : "invalid"
            }

            evalScript("$._BDP_.getLastSelectedFile()", (fileInfoString) =>{ 
                /**
                 *  The CEP Interface returns the array as a string of the elements it
                 *  contains seperated by commas
                */
                var fileInfo = fileInfoString.split(",");

                if (fileInfo[0] != "invalid") {      
                    // If the returned file is valid
                    file.name = fileInfo[0];
                    file.path = fileInfo[1];
                    file.treePath = fileInfo[2];

                    // Set import mode to Premiere Project
                    window.importedThroughSystem = 0;
                    var type = 'Project (Drag & Drop)';

                    importFile(file, type);

                }
                else{
                    raiseAlert("Invalid file","Please import an audio file!");
                }
            });
            return
        }
        // Imported through system
        var file = ev.dataTransfer.files[0];
        var type = 'Drag & Drop';
    }
    else{
        // Regular system import
        var file = document.getElementById("file-input").files[0];
        var type = 'Select File';
    }

    // Set the import mode to filesystem
    window.importedThroughSystem = 1;
    importFile(file, type);
}

/**
 * Method that handles the correct import of the file before 
 * running the beat detection
 */

function importFile(file, type)
{
    var newFile = ffmpegToWAV(file);

    if(!newFile || !storeOutputIfExists(newFile)){      
        raiseAlert("Error!", "Error while processing Input file!");
        return;
    } 

    // Send event to dataLayer
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const reader = new FileReader();

    reader.onload = function(e){
        const arrayBuffer = e.target.result;
        audioContext.decodeAudioData(arrayBuffer)
            .then(function(buffer){
            const duration = new Date(buffer.duration * 1000).toISOString().substr(14, 5);
            audioImportTrack(type, duration);
        });
    };
    reader.readAsArrayBuffer(blobFromPath(file.path));


    if(type == "Project"){
        // Show the imported file on Dropdown button
        document.querySelector(".dropzone").classList.remove("full");
        document.querySelector(".dropzone p").innerHTML="Drag Audio File Here";
        document.querySelector("#file-dropdown .dropdown-current span").style = "color: " + theme.getPropertyValue("--text-color");
    }
    else {
        // Show the imported file on the dragzone
        document.querySelector(".dropzone").classList.add("full");
        document.querySelector(".dropzone p").innerHTML = window.audioFile.originalName;

        var selected = document.querySelector("#file-dropdown .selected");

        if (selected){
            selected.classList.remove("selected");
        }
        
        document.querySelector("#file-dropdown .dropdown-current span").innerHTML = "Select from project files";
        document.querySelector("#file-dropdown .dropdown-current span").style = "color: " + theme.getPropertyValue('--ui-dim-color');
    }

    // Update UI functionality panel
    var createMarkersButton = document.getElementById("create-markers");
    createMarkersButton.disabled = true;
    var markerNumberInput = document.getElementById("marker-number");
    markerNumberInput.disabled = true;
    
    markerNumberInput.classList.add("active")

    var waveFormHolder = document.querySelector(".waveform-holder");
    waveFormHolder.style.pointerEvents  = "initial";

    loadWaveform();

    // Run beat detection
    detectBeats(newFile); 
}

/**
 * Method that stores the audio file name, full path and path in the premiere poject
 * (if that exists).
 * Takes a file object as an input which could be either the dataTransfer generated one
 * or the custom one from the selectFileFromDropdownHandler() function.
 */
function storeOutputIfExists(file) {
    // Check if the file does not exist
    if (!fs.existsSync(file.path))
    {
        // Clear file input
        var file = document.getElementById("file-input").value = null;
        
        return false;
    }

    // Check if we have selected a new file and only then clear the old output 
    if (window.audioFile.filePath != file.path){
        cleanOutput()
    }

    // Store file information
    window.audioFile.fileName = file.name;
    window.audioFile.filePath = file.path;
    window.audioFile.treePath = file.treePath;
    window.audioFile.originalName = file.oldName;
    window.audioFile.originalPath = file.oldFilePath;

    // On successful import
    return true;

}

/**
 * Method that runs the beat detection analysis by using IBT
 * This method creates txt files in extesion's output directory, 
 * which will be loaded by 'createMarkers()'.
 */ 
async function detectBeats(tempFile) {
    var filepath = tempFile.path

    // Build command for detection
    var detectionCommand = window.detectorLocation + " -off " + '"' + filepath + '"' + " \"" + window.outputDir + "\"";
    
    // Open the loading modal
    openLoadingModal("Analyzing your audio");
    
    // Start child process
    exec(detectionCommand, {encoding: "UTF-8"}, function (err){
        // Load the data from the algorithm's output
        var thisFilePath = window.audioFile.originalPath.replace(/\\/g,"/");
        // Big regex: Negative look forward until last slash, capture everything up to (excluding) the last dot 
        // Index 1 means the first capture group
        var fileName = thisFilePath.match(/(?!.*\/)(.+)\./)[1];
        var setAudioPath = "$._BDP_.setAudioFile(\"" + thisFilePath  + "\")";
        evalScript(setAudioPath);
        window.allBeats = readBeatsTxt(fileName);
        // Initially, select 20% of all beats
        setMarkerInputUI(Math.floor(window.allBeats.length / 5));
        updateAvailableMarkers();
        var createMarkersButton = document.getElementById("create-markers");
        createMarkersButton.disabled = false;
        var markerNumberInput = document.getElementById("marker-number");
        markerNumberInput.disabled = false;

        // Close loading modal
        closeLoadingModal();
       
        // Remove the temp file
        fs.unlink(tempFile.path, () => {});
        return;
    });
}

function setMarkerInputUI(value){
    var markerInput = document.querySelector("#marker-number");
    markerInput.value = value;
    if (sessionStorage.getItem("initialMarkers") === null){
        sessionStorage.setItem('initialMarkers', markerInput.value);
    }
}

function setMaxMarkersUI(max){
    var maxMarkers = document.querySelector("#maxMarkers");
    maxMarkers.textContent = "(Max: " + max + ")";
}

/**
 * This function updates the currently available markers and is called
 * whenever the user adjusts the region position/range
 */
function updateAvailableMarkers(){
    // Look for matching markers inside region
    var markersInRegion = [];
    for(let i = 0; i < window.allBeats.length; i++){
        if((window.allBeats[i] >= window.region.start) && (window.allBeats[i] <= window.region.end)){
            // Push matching markers in markersInRegion array (this keeps them sorted by power)
            markersInRegion.push(window.allBeats[i]);
        }
    }
    setMaxMarkersUI(markersInRegion.length);
    var markerAmount = parseInt(document.querySelector("#marker-number").value);
    if(markerAmount > markersInRegion.length){
        markerAmount = markersInRegion.length;
        setMarkerInputUI(markerAmount);
    }
    window.availableBeats = markersInRegion;
    showAvailableMarkers();
    updateSelectedMarkers();
}

/**
 * This function updates the currently available markers and is called
 * whenever the user changes the number of requested markers
 */
function updateSelectedMarkers(){
    var markerAmount = parseInt(document.querySelector("#marker-number").value);
    var markers = [];
    for(let i = 0; i < window.availableBeats.length; i++){
        if (i >= markerAmount) break;
        markers.push(window.availableBeats[i]);
    }
    window.selectedBeats = markers;
    // If wavesurfer is playing cancel old clicks and schedule new ones
    if(wavesurfer.isPlaying()){
        clickVolume.gain.cancelScheduledValues(ctx.currentTime);
        clickVolume.gain.setValueAtTime(0, ctx.currentTime);
        scheduleClicks(window.selectedBeats,wavesurfer.getCurrentTime());
    }
    showSelectedMarkers();
}

function showSelectedMarkers(){
    var availableMarkers = document.querySelectorAll("wave marker");
    var selectedMarkers = document.querySelectorAll("wave marker:nth-child(-n +" + (window.selectedBeats.length + 3) + ")");
    var availableMarkerscolor = theme.getPropertyValue("--available-marker-color");
    var selectedMarkerscolor = theme.getPropertyValue("--selected-marker-color");
    if (localStorage.getItem("colorMode") === "Light"){
        availableMarkerscolor = theme.getPropertyValue("--available-marker-color-light");
        selectedMarkerscolor = theme.getPropertyValue("--selected-marker-color-light");
    }
    for(marker of availableMarkers){
        marker.querySelector("div").style.background = availableMarkerscolor;
    }
    for(marker of selectedMarkers){
        marker.querySelector("div").style.background = selectedMarkerscolor;
    }
}

function showAvailableMarkers(){
    wavesurfer.markers.clear();
    for(let i=0; i < window.availableBeats.length; i++){
        wavesurfer.markers.add({
            time: window.availableBeats[i],
            color: theme.getPropertyValue("--accent-color"),
            hasPoint: false,
            position: 'top'
        })
    }
}

/**
 * Method that is called as soon as the extension is loaded.
 * See HTML <body onload="onLoad()"
 */
var wavesurfer;
var minPixPerSec;
var waveformZoom;
function onLoad() {
    // Get system info such as OS and relevant filepaths
    getSystemSetup();
    // Attach event listeners to #marker-number <input>

    let lastMousePosition = undefined;
    function markerNumberMouseMove(ev) {
        let el = document.getElementById("marker-number");
        document.body.classList.add("grabbing");
        // Premiere doesn't populate ev.movement[X|Y] properly
        let movementX = 0;
        let movementY = 0;
        if (lastMousePosition) {
            movementX = ev.pageX - lastMousePosition.pageX;
            movementY = ev.pageY - lastMousePosition.pageY;
        }
        // Premiere seems to handle x & y coordinates independently
        // eg. dragging from the component center towards the top left leaves the
        // value unmodified
        el.value = parseInt(el.value) + Math.sign(movementX) - Math.sign(movementY);
        el.value = Math.min(Math.max(el.value, 1), window.availableBeats.length);
        lastMousePosition = { pageX: ev.pageX,
                              pageY: ev.pageY };
        // Update markers shown in waveform
        updateSelectedMarkers();
    }

    let attachListeners = function () {
        let el = document.getElementById("marker-number");
        if (!el.disabled) {
            lastMousePosition = undefined;

            window.addEventListener("mousemove", markerNumberMouseMove);
            window.addEventListener("mouseup", detachListeners);
            window.addEventListener("mouseleave", detachListeners);
        }
    }

    let detachListeners = function () {
        document.body.classList.remove("grabbing");
        if (!lastMousePosition || (lastMousePosition.pageX == 0 && lastMousePosition.pageY == 0)) {
            let el = document.getElementById("marker-number");
            el.readOnly = false;
        }

        window.removeEventListener("mousemove", markerNumberMouseMove);
        window.removeEventListener("mouseup", detachListeners);
        window.removeEventListener("mouseleave", detachListeners);
    }

    let el = document.getElementById("marker-number");
    el.addEventListener("mousedown", attachListeners);
    el.addEventListener("mouseup", detachListeners);

    // Load the JSX file
    loadJSX();
    evalScript("$._BDP_.registerProjectPanelSelectionChangedFxn()");
    evalScript("$._BDP_.registerActiveSequenceSelectionChangedFxn()");
    // The ibt algorithm doesn't generate the output directory
    if (!fs.existsSync(window.outputDir)) {
        fs.mkdir(window.outputDir, { recursive : true }, (err) => {if (err) throw err;});
    }

    var wavecolor = theme.getPropertyValue("--wavecolor-color");
    var progresscolor = theme.getPropertyValue("--progresscolor-color");
    var cursorcolor = theme.getPropertyValue("--cursorcolor-color");
    if (localStorage.getItem("colorMode") === "Light"){
        progresscolor = theme.getPropertyValue("--progresscolor-color-light");
    }
    // load wavesurfer
    wavesurfer = WaveSurfer.create({
        container: '#wavesurfer',
        waveColor: wavecolor,
        progressColor: progresscolor,
        cursorColor: cursorcolor,
        barGap: 2,
        barWidth: 2,
        barRadius: 2,
        barMinHeight: 1,
        fillParent: true,
        interact: true,
        height: 70,
        plugins: [
            WaveSurfer.markers.create({
                markers: []
            }),
            WaveSurfer.regions.create({
                regionsMinLength: 1,
                dragSelection: false
            }),
        ]
    });
    wavesurfer.drawBuffer();
    //Subscribe to region updates
    wavesurfer.on("region-update-end", ()=>{
        updateAvailableMarkers();
    })
    // Subscribe to playback events
    wavesurfer.on('pause', () => {
        document.querySelector(".play-button").classList.remove("playing");
        clickVolume.gain.cancelScheduledValues(ctx.currentTime);
        clickVolume.gain.setValueAtTime(0, ctx.currentTime);
    });
    wavesurfer.on('play', () => {
        document.querySelector(".play-button").classList.add("playing");
        clickVolume.gain.cancelScheduledValues(ctx.currentTime);
        clickVolume.gain.setValueAtTime(0, ctx.currentTime);
        scheduleClicks(window.selectedBeats, wavesurfer.getCurrentTime());
    })
    wavesurfer.on('finish', () => {
        document.querySelector(".play-button").classList.remove("playing");
    });
    wavesurfer.on('audioprocess', ()=>{
        let region = Object.values(wavesurfer.regions.list)[0];
        if (Math.round(wavesurfer.getCurrentTime()*100)/100 == Math.round(region.end*100)/100){
            wavesurfer.pause();
        }
    })
    // Initialise click sound
    clickInit();
}

function clickInit(){
    ctx = new AudioContext();
    click = ctx.createOscillator();
    clickVolume = ctx.createGain();

    click.type = 'sine';
    click.frequency.value = 880;
    clickVolume.gain.value = 0;

    click.connect(clickVolume);
    clickVolume.connect(ctx.destination);
    click.start(0);
}

function clickAtTime(time) {
    // Silence the click.
    clickVolume.gain.setValueAtTime(0, time);

    // Make click sound.
    clickVolume.gain.linearRampToValueAtTime(1, time + .001);
    clickVolume.gain.linearRampToValueAtTime(0, time + .001 + .008);
  }

function loadWaveform(){
    // Disable play button
    document.querySelector(".play-button").disabled = true;
    document.querySelector(".play-button").classList.remove("playing");
    
    // Load the file from path into BLOB
    var blob = blobFromPath(window.audioFile.filePath);
    wavesurfer.loadBlob(blob);
    
    // When waveform is ready, reset zoom level
    wavesurfer.on('ready',()=>{
        // Min zoom (pixels per second) is waveform width divided by audio duration
        minPixPerSec = document.querySelector("wave").offsetWidth/wavesurfer.getDuration();
        waveformZoom = 0;
        wavesurfer.zoom(minPixPerSec);
        // For min zoom set overflow to visible so that handles show correctly
        document.querySelector("wave").style.overflow = "visible";
        // Add active region from track start to track end
        var barscolor = theme.getPropertyValue("--barscolor-color");
        if (localStorage.getItem("colorMode") === "Light"){
            barscolor = theme.getPropertyValue("--barscolor-color-light");
        }
        wavesurfer.clearRegions();
        let handleStyleParams = {
            width: '3px',
            cursor: 'col-resize',
            backgroundColor: barscolor
        }
        window.region = wavesurfer.addRegion({
            start: 0,
            end: wavesurfer.getDuration(),
            loop: false,
            color: 'rgba(66, 141, 203, 0)',
            handleStyle:{
                left: handleStyleParams,
                right: handleStyleParams
            }
        });
    })

    var wavecolor = theme.getPropertyValue("--wavecolor-color");
    var cursorcolor = theme.getPropertyValue("--cursorcolor-color");
    if (localStorage.getItem("colorMode") === "Light"){
        wavecolor = theme.getPropertyValue("--wavecolor-color-light");
        cursorcolor = theme.getPropertyValue("--cursorcolor-color-light");
    }
    // Clear any previous markers
    wavesurfer.markers.clear();
    wavesurfer.setWaveColor(wavecolor);
    wavesurfer.setCursorColor(cursorcolor);
    // Clear placeholder text
    var overlay = document.querySelector("#wavesurfer-overlay");
    overlay.querySelector("span").textContent="";
    document.querySelector(".play-button").disabled = false;
}

/**
* Method that initiates playback from region start 
*
*/

function playbackHandler(){
    if (wavesurfer.isPlaying())
    {
        wavesurfer.pause();
        return;
    } 
    let region = Object.values(wavesurfer.regions.list)[0];
    region.play();
}

function zoomWaveform(e){
    if(e.ctrlKey){
      e.preventDefault();
    }
    let direction = Math.sign(-e.deltaY);
    let force = Math.log((Math.abs(e.deltaY)/12)+1)/30;
    let newWaveformZoom = Math.max(Math.min(waveformZoom + direction*force,1),0);
    // For min zoom set overflow to visible so that handles show correctly
    if(newWaveformZoom == 0){
        document.querySelector("wave").style.overflow = "visible"
    }
    if(waveformZoom === newWaveformZoom){
        return;
    }
    document.querySelector("wave").style.overflow = "auto hidden"
    waveformZoom = newWaveformZoom;
    var wave = document.querySelector("wave");
    var pointerPos = e.clientX - wave.getBoundingClientRect().x;
    var offset = (wave.scrollLeft + pointerPos)/wave.scrollWidth;
    wavesurfer.zoom((100-minPixPerSec)*(waveformZoom**3)+minPixPerSec);
    var position = wave.scrollWidth*offset - pointerPos;
    wave.scrollTo(position,0);
}

function scheduleClicks(markers, startTime){
    const now = ctx.currentTime;
    for(marker of markers){
        let time = marker - startTime;
        if(time > 0){
            clickAtTime(now + marker - startTime);
        }
    }
}

/**
 * Method that cleans the ibt's output
 */

function cleanOutput(){ 
    const path = require("path");

    fs.readdir(window.outputDir, (err, files)=> {
        if (err) throw err;
        for (const file of files){
            if (file.endsWith(".txt")){
                fs.unlink(path.join(window.outputDir, file), err => {
                    if (err) throw err;
                });
            }
        }
    });
}

/**
* Load JSX file into the scripting context of the product. All the jsx files in 
* folder [ExtensionRoot]/jsx will be loaded.
*/
function loadJSX() {
    // load general JSX script
    var extensdScriptPath = window.extensionPath + "/jsx/main.jsx";
    evalScript("$._ext.evalFiles(\"" + extensdScriptPath + "\")");
}

/**
 * Handy method to call JSX methods with new CSInterface instance
 * as HTML callbacks.
 */
function evalScript(script, callback) {
    new CSInterface().evalScript(script, callback);
}

/**
 * The callback method of the "Create Markers" button. It creates a
 * sequence with markers based on the selected beat detection modes.
 */
function createMarkers() {
    var markerAmount = parseInt(document.querySelector("#marker-number").value);
    createMarkersTrack(markerAmount, sessionStorage.getItem('initialMarkers'));

    var treepath = window.audioFile.treePath;
    // Pause playback
    wavesurfer.pause();
    document.querySelector(".play-button").classList.remove("playing");

    // Start the loading modal
    openLoadingModal("Creating your markers");
    // We have to replace \ with / for jsx to handle
    if(treepath){
        treepath = treepath.replace(/\\/g,"/");
    }
    // Remove everything after the Path last occurance of . (filename may contain more instances of the '.' character)
    // For some reason the seperator ( ) adds 1 empty element on index 0 of the array so we take index 1
    var thisFileName = window.audioFile.originalName.split(/(.*)\./)[1];

    if (!thisFileName){
        var fileName = window.audioFile.originalName
    } else {
        var fileName = thisFileName.replace(/\\/g,"/");
    }
    var thisFilePath = window.audioFile.originalPath.replace(/\\/g,"/");

    evalScript("$._BDP_.createMarkers([" + window.selectedBeats.toString() + "]," +
                                                              window.importedThroughSystem + ",'" +
                                                              fileName + "','" +
                                                              thisFilePath + "','"+
                                                              treepath + "')",
    (response) => {
        // Close the loading modal
        closeLoadingModal();
        if(response == "true"){
            // Enable undo button
            document.querySelector("#undo-markers").disabled = false;
        }
    });
}

function undoMarkers() {
    var undoButton = document.querySelector("#undo-markers");
    var undoScript = "$._BDP_.undoMarkers()";
    openLoadingModal("Removing Markers");
    // If no undo steps left, disable undo button
    evalScript(undoScript,() => {
        closeLoadingModal();
    });
    evalScript("$._BDP_.getUndoSteps()", steps => {
        if(steps < 1){
            undoButton.disabled = true;
        }   
    })
    
}

function raiseAlert(alertTitle,alertText){
    const alertModal = document.querySelector("#alert-modal");
    const title = alertModal.querySelector("#alert-title");
    const alertBody = alertModal.querySelector("#alert-body");

    title.innerHTML = alertTitle;
    alertBody.innerHTML = alertText;
    alertModal.style.display = "flex";
}

function closeAlertBox(){
    const alertModal = document.querySelector("#alert-modal");
    alertModal.style.display = "none";
}

function openAboutBox(){
    const modal = document.querySelector('#about-modal');
    const aboutBox = modal.querySelector('.modal-content');
    const version = aboutBox.querySelector('#commit-hash');

    version.textContent = BeatMarkerVersion;
    modal.style.display = "flex";
    aboutBox.scrollTop = 0;
}

function closeAboutBox(){
    const modal = document.querySelector('#about-modal');
    modal.style.display = "none";
}

function openLicensesFile(){
    if (window.OS == "Mac") {
        exec('open' + ' "' + window.extensionPath + '/LICENSE.txt"');
    }
    else if (window.OS == "Windows") {
        exec('start' + ' /D "' + window.extensionPath + '" .\\LICENSE.txt');
    }
}

function openLoadingModal(textStringOrArray){
    var modal = document.querySelector("#loading-modal");
    var loadingText = modal.querySelector("#loading-text");
    var isString = (typeof textStringOrArray == "string");

    if (isString) {
        var textToDisplay = textStringOrArray;
        
    } else {
        var textToDisplay = getRandomItem(textStringOrArray);
        switchTextInterval = setInterval(function() {
            textToDisplay = getRandomItem(textStringOrArray);
        }, 2000)
    }

    loadingText.innerHTML = textToDisplay;
    i = 0;
    // Globally defined
    loadingTextInterval = setInterval(function() {
        i = ++i % 4;
        loadingText.innerHTML = textToDisplay + Array(i+1).join(" .");
    },  500);
    modal.style.display = "flex";
}

function closeLoadingModal(){
    var modal = document.querySelector("#loading-modal");
    modal.style.display = "none";
    clearInterval(loadingTextInterval);
    if (window.switchTextInterval){
        clearInterval(switchTextInterval);
    }
}

// Toggle side menu
function toggleSideMenu(){
    var modalMainRegLog = document.getElementById('register-login')
    var modal = document.getElementById('side-menu');
    checkConsent();
    if (!modalMainRegLog.classList.contains('show') && !modal.classList.contains('show')){
        modal.classList.add('show');
    }
    else {
        modal.classList.remove('show');
    }
}

// Toggle parent modal of Register / login screen
function toggleMainRegLogModal(){
    var modalMainRegLog = document.getElementById('register-login');
    if (modalMainRegLog.classList.contains('show')){
        modalMainRegLog.classList.remove('show');
        if (localStorage.getItem('privacy') === 'true'){
            ga('accusonus.send', 'pageview', './index.html', {
                'dimension1': (localStorage.getItem('userID') !== null && localStorage.getItem('userID') !== 'null'
                ? 1 : 0),
                'dimension4': (localStorage.getItem('userID') !== null && localStorage.getItem('userID') !== 'null'
                ? localStorage.getItem('userID') : undefined),
                'dimension6': 'false',
                'dimension9': 'BeatMarker'
            });
            ga('beatmarker.send', 'pageview', './index.html', {
                'dimension1': (localStorage.getItem('userID') !== null && localStorage.getItem('userID') !== 'null'
                ? 1 : 0),
                'dimension2': (localStorage.getItem('userID') !== null && localStorage.getItem('userID') !== 'null'
                ? localStorage.getItem('userID') : undefined),
                'dimension3': 'false',
                'dimension4': 'BeatMarker'
            });
        }
    }
    else {
        modalMainRegLog.classList.add('show');
    }
}

// Toggle form modals inside parent Register / login screen
function changeForm(page){
    var modalRegister = document.getElementById('register-screen');
    var modalLogin = document.getElementById('login-screen');
    var modalReset = document.getElementById('resetpass-screen');
    var modalThankyou = document.getElementById('thankyou-screen');
    var modalMainRegLog = document.getElementById('register-login');

    if (!modalMainRegLog.classList.contains('show')){
        toggleMainRegLogModal();
    }

    if (page == 'Login'){
        checkConsent();
        if (modalRegister.classList.contains('show')){
            modalRegister.classList.remove('show');
        }

        if (modalReset.classList.contains('show')){
            modalReset.classList.remove('show');
        }

        modalLogin.classList.add('show');
        // Add listeners on enter key press to submit forms
        document.getElementById('logfusername').addEventListener('keyup', function(e) {
            if (e.key === 'Enter')
            {
                submitForm('Login');
            }
        });
        
        document.getElementById('logfpassword').addEventListener('keyup', function(e) {
            if (e.key === 'Enter')
            {
                submitForm('Login');
            }
        });
    }

    if (page == 'Register'){
        checkConsent();
        if (modalLogin.classList.contains('show')){
            modalLogin.classList.remove('show');
        }

        if (modalReset.classList.contains('show')){
            modalReset.classList.remove('show');
        }

        modalRegister.classList.add('show');
        // Add listeners on enter key press to submit forms
        document.getElementById('regfusername').addEventListener('keyup', function(e) {
            if (e.key === 'Enter')
            {
                submitForm('Register');
            }
        });
        
        document.getElementById('regfpassword').addEventListener('keyup', function(e) {
            if (e.key === 'Enter')
            {
                submitForm('Register');
            }
        });
    }

    if (page == 'Reset'){
        if (modalRegister.classList.contains('show')){
            modalRegister.classList.remove('show');
        }

        if (modalLogin.classList.contains('show')){
            modalLogin.classList.remove('show');
        }

        modalReset.classList.add('show');
        // Add listeners on enter key press to submit forms
        document.getElementById('resfusername').addEventListener('keyup', function(e) {
            if (e.key === 'Enter')
            {
                submitForm('Reset');
            }
        });
    }

    if (page == 'Thankyou'){
        var thankyouMessage = document.getElementById('thankyou-message');
        if (modalRegister.classList.contains('show')){
            thankyouMessage.innerHTML = 'Successful registration';
            modalRegister.classList.remove('show');
        }

        if (modalLogin.classList.contains('show')){
            thankyouMessage.innerHTML = 'Successful login';
            modalLogin.classList.remove('show');
        }

        modalThankyou.classList.add('show');
    }
}

// Close thank you modal and container modal
function closeThankyouPage(){
    var modalThankyou = document.getElementById('thankyou-screen');
    if (modalThankyou.classList.contains('show')){
        modalThankyou.classList.remove('show');
        toggleMainRegLogModal();
        accountIconShowHide();
    }
}

// Button click Music cellar
function musicCellarBtnClick(){
    musicCellarLinkTrack();
    window.cep.util.openURLInDefaultBrowser('https://music-cellar.accusonus.com/?utm_source=beatmarker&utm_medium=plugin&utm_campaign=BeatmarkerMusicCellar');
}

// Function that process form requests
function submitForm(form){
    var fusername, fpassword;

    if (form == 'Login'){
        fusername = document.getElementById('logfusername');
        fpassword = document.getElementById('logfpassword');

        if (fusername.value == null || fpassword.value == null || fusername.value == '' || fpassword.value == ''){
            userNotificationsTrack('108');
            showMessages('Login', 'Error', 'Please provide email and password');
        }
        else {
            loginUser(fusername.value, fpassword.value);
        }
    }

    if (form == 'Register'){
        fusername = document.getElementById('regfusername');
        fpassword = document.getElementById('regfpassword');

        if (fusername.value == null || fpassword.value == null || fusername.value == '' || fpassword.value == ''){
            userNotificationsTrack('108');
            showMessages('Register', 'Error', 'Please provide email and password');
        }
        else {
            openLoadingModal('Creating your account');
            signupUser(fusername.value, fpassword.value);
        }
    }

    if (form == 'Reset'){
        fusername = document.getElementById('resfusername');

        if (fusername.value == null || fusername.value == ''){
            userNotificationsTrack('108');
            showMessages('Reset', 'Error', 'Please provide email');
        }
        else {
            passwordresetUser(fusername.value);
        }
    }
}

// Show messages to the user
function showMessages(form, type, message){
    var messageContainer;
    var formSubtitle;

    if (form == 'Login'){
        messageContainer = document.getElementById('login-messages');
        formSubtitle = document.getElementById('login-subtitle');
    }

    if (form == 'Register'){
        messageContainer = document.getElementById('register-messages');
        formSubtitle = document.getElementById('register-subtitle');
    }

    if (form == 'Reset'){
        messageContainer = document.getElementById('reset-messages');
        formSubtitle = document.getElementById('reset-subtitle');
    }

    if (type == 'Error'){
        formSubtitle.style.display = 'none';
        messageContainer.style.display = 'inherit';
        messageContainer.classList.add('form-messages-red');
        messageContainer.innerHTML = (message);
    }

    if (type == 'Pass'){
        formSubtitle.style.display = 'none';
        messageContainer.style.display = 'inherit';
        messageContainer.classList.add('form-messages-green');
        messageContainer.innerHTML = (message);
    }
}

// Remove messages and clear all inputs (used when user logs out)
function removeMessages(){
    var messageContainerLog = document.getElementById('login-messages');
    var formSubtitleLog = document.getElementById('login-subtitle');
    var messageContainerReg = document.getElementById('register-messages');
    var formSubtitleReg = document.getElementById('register-subtitle');
    var messageContainerRes = document.getElementById('reset-messages');
    var formSubtitleRes = document.getElementById('reset-subtitle');

    formSubtitleLog.style.display = 'inherit';
    messageContainerLog.style.display = 'none';
    formSubtitleReg.style.display = 'inherit';
    messageContainerReg.style.display = 'none';
    formSubtitleRes.style.display = 'inherit';
    messageContainerRes.style.display = 'none';
    document.getElementById('regfusername').value= null;
    document.getElementById('regfpassword').value= null;
    document.getElementById('logfusername').value= null;
    document.getElementById('logfpassword').value= null;
    document.getElementById('resfusername').value= null;
}

// Hide - Show account icon
function accountIconShowHide(){
    var licencerBtn = document.getElementById('licenser-btn');
    if ( licencerBtn.classList.contains('hide') ){
        licencerBtn.classList.remove('hide');
        licencerBtn.classList.add('show');
    }
    else {
        licencerBtn.classList.remove('show');
        licencerBtn.classList.add('hide');
    }
}

function setPrivacy() {
  var checkBox = document.getElementById("privacy-policy-checkbox");
  var checkBoxRegister = document.getElementById("privacy-policy-form-checkbox-register");
  var checkBoxLogin = document.getElementById("privacy-policy-form-checkbox-login");


  if ((checkBox.checked == true || checkBoxRegister.checked == true || checkBoxLogin.checked == true) && localStorage.getItem("privacy") === "false"){
    localStorage.setItem("privacy", "true");
  }
  else {
    localStorage.setItem("privacy", "false");
  }
}

function checkConsent(){
    // Initial value of privacy checkbox
    var checkBox = document.getElementById("privacy-policy-checkbox");
    var checkBoxRegister = document.getElementById("privacy-policy-form-checkbox-register");
    var checkBoxLogin = document.getElementById("privacy-policy-form-checkbox-login");

    if (localStorage.getItem("privacy") === null || localStorage.getItem("privacy") === 'null') {
        if (consentRequired()){
            localStorage.setItem("privacy", "false");
            checkBox.checked = false;
            checkBoxRegister.checked = false;
            checkBoxLogin.checked = false;    
        }
        else{
            localStorage.setItem("privacy", "true");
            checkBox.checked = true;
            checkBoxRegister.checked = true;
            checkBoxLogin.checked = true;
        }
    }
    else {
        var privacyVal = (localStorage.getItem("privacy") === "true");
        checkBox.checked = privacyVal;
        checkBoxRegister.checked = privacyVal;
        checkBoxLogin.checked = privacyVal;
    }
}

function setColorMode() {
    var colorLabel = document.getElementById('colorMode-switch');
    var colorInput = document.getElementById('colorMode-switch').getElementsByTagName( 'input' )[0];
    if (colorInput.checked == true){
        colorLabel.classList.add('colorMode-switch-checked');
        localStorage.setItem("colorMode", "Light");
    }
    else {
        colorLabel.classList.remove('colorMode-switch-checked');
        localStorage.setItem("colorMode", "Default");
    }
    themeInit();
  }

  function themeInit(){
    // Initial value of color mode
    var checkBoxcolorInput = document.getElementById('colorMode-switch').getElementsByTagName( 'input' )[0];
    showSelectedMarkers();
    if (localStorage.getItem("colorMode") === "Light"){
        var colorLabel = document.getElementById('colorMode-switch');
        checkBoxcolorInput.checked = true;
        colorLabel.classList.add('colorMode-switch-checked');

        // Theme changes
        document.body.classList.add("light");
        document.getElementById("logo").src="img/accusonusBlack.svg";
        if (wavesurfer){
            wavesurfer.setWaveColor(theme.getPropertyValue("--wavecolor-color-light"));
            wavesurfer.setProgressColor(theme.getPropertyValue("--progresscolor-color-light"));
            wavesurfer.setCursorColor(theme.getPropertyValue("--cursorcolor-color-light"));
        }
        document.getElementById("marker-number").classList.add("light");
        document.getElementById("wavesurfer-overlay").classList.add("light");
        var i;

        var wave = document.getElementsByClassName("wavesurfer-handle");
        for ( i = 0; i < wave.length; i++) {
            wave[i].classList.add("light");
        }
        var dropZ = document.getElementsByClassName("dropzone");
        for ( i = 0; i < dropZ.length; i++) {
            dropZ[i].classList.add("light");
        }
        var but = document.getElementsByClassName("button");
        for ( i = 0; i < but.length; i++) {
            but[i].classList.add("light");
        }
        var drop = document.getElementsByClassName("dropdown");
        for (i = 0; i < drop.length; i++) {
            drop[i].classList.add("light");
        }
        var dropOpt = document.getElementsByClassName("dropdown-options");
        for (i = 0; i < dropOpt.length; i++) {
            dropOpt[i].classList.add("light");
        }
        var dropArr = document.getElementsByClassName("dropdown-arrow");
        for (i = 0; i < dropArr.length; i++) {
            dropArr[i].classList.add("light");
        }
        var modalCon = document.getElementsByClassName("modal-content");
        for (i = 0; i < modalCon.length; i++) {
            modalCon[i].classList.add("light");
        }
    }
    else {
        // Theme changes
        document.body.classList.remove("light");
        document.getElementById("logo").src="img/accusonus.svg";
        if (wavesurfer){
            wavesurfer.setWaveColor(theme.getPropertyValue("--wavecolor-color"));
            wavesurfer.setProgressColor(theme.getPropertyValue("--progresscolor-color"));
            wavesurfer.setCursorColor(theme.getPropertyValue("--cursorcolor-color"));
        }

        var wave = document.getElementsByClassName("wavesurfer-handle");
        for ( i = 0; i < wave.length; i++) {
            wave[i].classList.remove("light");
        }
        document.getElementById("marker-number").classList.remove("light");
        document.getElementById("wavesurfer-overlay").classList.remove("light");

        var but = document.getElementsByClassName("button");
        var i;
        for (i = 0; i < but.length; i++) {
            but[i].classList.remove("light");
        }
        var dropZ = document.getElementsByClassName("dropzone ");
        for ( i = 0; i < dropZ.length; i++) {
            dropZ[i].classList.remove("light");
        }
        var drop = document.getElementsByClassName("dropdown");
        for (i = 0; i < drop.length; i++) {
            drop[i].classList.remove("light");
        }
        var dropOpt = document.getElementsByClassName("dropdown-options");
        for (i = 0; i < dropOpt.length; i++) {
            dropOpt[i].classList.remove("light");
        }
        var dropArr = document.getElementsByClassName("dropdown-arrow");
        for (i = 0; i < dropArr.length; i++) {
            dropArr[i].classList.remove("light");
        }
        var modalCon = document.getElementsByClassName("modal-content");
        for (i = 0; i < modalCon.length; i++) {
            modalCon[i].classList.remove("light");
        }
    }
  }
  
/*
 * Api calls
*/

// Register user
function signupUser(username, password){
    var formdata = new FormData();
    formdata.append('username', username);
    formdata.append('password', password);

    var requestOptions = {
        method: 'POST',
        body: formdata,
    };

    fetch('https://accusonus.com/api/v1/user/sign-up', requestOptions)
        .then(response => response.json())
        .then(result => {
            if (result.result == 30){
                closeLoadingModal();
                acProductLineIntent(username);
                showMessages('Register', 'Pass', result.success);
                updateUserInfo(result.uid, result.mail);
                formActionTrack('Register');
                userNotificationsTrack(result.result);
                changeForm('Thankyou');
                setTimeout(() => {
                    closeThankyouPage();
                }, 1500);
            }
            else {
                closeLoadingModal();
                userNotificationsTrack(result.result);
                showMessages('Register', 'Error', result.error.replace(/(<([^>]+)>)/gi, ''));
            }
        })
        .catch(error => console.log('error', error));
}

// Login user
function loginUser(username, password){
    var formdata = new FormData();
    formdata.append('username', username);
    formdata.append('password', password);

    var requestOptions = {
        method: 'POST',
        body: formdata,
    };

    fetch('https://accusonus.com/api/v1/user/login', requestOptions)
        .then(response => response.json())
        .then(result => {
            if (result.result == 21){
                showMessages('Login', 'Pass', result.success);
                updateUserInfo(result.uid, result.mail);
                formActionTrack('Login');
                userNotificationsTrack(result.result);
                changeForm('Thankyou');
                setTimeout(() => {
                    closeThankyouPage();
                }, 1500);
            }
            else {
                userNotificationsTrack(result.result);
                showMessages('Login', 'Error', result.error.replace(/(<([^>]+)>)/gi, ''));
            }
        })
        .catch(error => console.log('error', error));
}

// Reset user password
function passwordresetUser(username){
    var formdata = new FormData();
    formdata.append('username', username);

    var requestOptions = {
        method: 'POST',
        body: formdata,
    };

    fetch('https://accusonus.com/api/v1/user/password-reset', requestOptions)
        .then(response => response.json())
        .then(result => {
            if (result.result == 24){
                formActionTrack('Reset');
                userNotificationsTrack(result.result);
                showMessages('Login', 'Pass', result.success);
                changeForm('Login');
            }
            else {
                userNotificationsTrack(result.result);
                showMessages('Reset', 'Error', result.error.replace(/(<([^>]+)>)/gi, ''));
            }
        })
        .catch(error => console.log('error', error));
}

// Logout user
function logoutUser(){
    fetch('https://accusonus.com/api/v1/user/logout', { method: 'POST' })
        .then(response => response.json())
        .then(result => {
            if (result.result == 23){
                removeMessages();
                toggleSideMenu();
                accountIconShowHide();
                updateUserInfo();

                changeForm('Login');
            }
        })
        .catch(error => console.log('error', error));
}

// Check user status
function statusUser(){
    fetch('https://accusonus.com/api/v1/user/status', { method: 'POST' })
        .then(response => response.json())
        .then(result => {
            if (result.result == 22){
                changeForm('Register');
                updateUserInfo();
            }
            else {
                accountIconShowHide();
                updateUserInfo(result.uid, result.mail);
            }
        })
        .catch(error => console.log('error', error));
}

// Update user Info
function updateUserInfo(userID, userEmail){
    var saveInfo = false;
    if (userID !== undefined && userEmail !== undefined){
        saveInfo = true;
    }

    if (typeof(Storage) !== "undefined") {
        if (saveInfo){
            if (localStorage.getItem("userID") === null || localStorage.getItem("userID") === 'null') {
                localStorage.setItem("userID", userID);
            }
            if (localStorage.getItem("userEmail") === null || localStorage.getItem("userEmail") === 'null') {
                localStorage.setItem("userEmail", userEmail);
            }
        }
        else {
            if (localStorage.getItem("userID") !== null && localStorage.getItem("userID") !== 'null') {
                localStorage.setItem("userID", null);
            }
            if (localStorage.getItem("userEmail") !== null && localStorage.getItem("userEmail") !== 'null') {
                localStorage.setItem("userEmail", null);
            }
        }
    }
}

// Update ActiveCampaign product line intent
function acProductLineIntent(userEmail){
    var acUrlProductLineIntent = 'https://api.activecampaign.accusonus.com/ActiveCampaign/updateproductlineintent';

    var intentData = {
        userEmail: userEmail,
        productLineIntent: 'Beat Marking',
    }

    fetch(acUrlProductLineIntent, {
        method: "POST",
        mode:'no-cors',
        body: JSON.stringify(intentData),
        headers: {
          'Content-Type': 'application/json',
        }
      })
      .catch(error => console.log('error', error));
}

/*
 * DataLayer Events
 */

// Register - Login - Reset Password
function formActionTrack(type){
    if (localStorage.getItem("privacy") === "false")
        return;
    
    var action;

    if (type === 'Register'){
        action = 'Total Registrations';
    }
    else if (type === 'Login') {
        action = 'Total Logins';
    }
    else if (type === 'Reset'){
        action = 'Total Password Resets';
    }

    ga('accusonus.send', 'event', 'All User Events', action, 'BeatMarker Plugin', {
        'dimension1': (type !== 'Reset' ? 1 : 0),
        'dimension4': (type !== 'Reset' &&
        ((localStorage.getItem('userID') !== null && localStorage.getItem('userID') !== 'null')) 
            ? localStorage.getItem('userID') 
            : undefined),
    });
    ga('beatmarker.send', 'event', 'All User Events', action, 'BeatMarker Plugin', {
        'dimension1': (type !== 'Reset' ? 1 : 0),
        'dimension2': (type !== 'Reset'  &&
        ((localStorage.getItem('userID') !== null && localStorage.getItem('userID') !== 'null'))
            ? localStorage.getItem('userID') 
            : undefined),
    });
}

// User Notifications
function userNotificationsTrack(responseCode){
    if (localStorage.getItem("privacy") === "false")
        return;

    ga('accusonus.send', 'event', 'User Notifications', 'BeatMarker Plugin', `${responseCode}`);
    ga('beatmarker.send', 'event', 'User Notifications', 'BeatMarker Plugin', `${responseCode}`);
}

// Audio Import
function audioImportTrack(actionType, fileLength){
    if (localStorage.getItem("privacy") === "false")
        return;

    ga('beatmarker.send', 'event', 'Audio Import', actionType, fileLength);
}

// Create Markers
function createMarkersTrack(numberMarkers, fileLength){
    if (localStorage.getItem("privacy") === "false")
        return;

    ga('beatmarker.send', 'event', 'Create Markers', `${numberMarkers}`, `${fileLength}`);
}

// Music Cellar Link
function musicCellarLinkTrack(){
    if (localStorage.getItem("privacy") === "false")
        return;
        
    ga('beatmarker.send', 'event', 'Music Cellar Link', 'Click', 'BeatMarker Plugin');
}

function consentRequired() {
    var utc = dayjs.extend(window.dayjs_plugin_utc);
    var timezone = dayjs.extend(window.dayjs_plugin_timezone);
    dayjs.extend(utc);
    dayjs.extend(timezone);
    const tz = dayjs.tz.guess();
    if (europeanTime.indexOf(tz) > 0) {
        return true;
    }
    return false;
}
