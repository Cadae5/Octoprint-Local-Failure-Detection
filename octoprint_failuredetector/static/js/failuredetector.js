// failuredetector.js (Updated for Timelapse Selection Workflow)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;
        console.log("FailureDetector UNIFIED ViewModel initializing...");

        // --- SECTION 1: All UI Variables (Observables) ---
        // ... (all existing observables are the same)
        // --- NEW: Observable for the list of recorded timelapses ---
        self.recordedTimelapses = ko.observableArray([]);
        
        // --- SECTION 2: All UI Derived Values (Computed) ---
        // ... (all existing computeds are the same)

        // --- SECTION 3: All UI Actions (Button Clicks) ---
        self.forceCheck = function() { /* ... unchanged ... */ };
        self.openFailureReportModal = function() { /* ... unchanged ... */ };
        
        // --- NEW: Functions for the timelapse list ---
        self.refreshTimelapseList = function() {
            console.log("JS: Requesting list of recorded timelapses.");
            OctoPrint.simpleApiCommand("failuredetector", "list_recorded_timelapses");
        };

        self.reportFailureForTimelapse = function(timelapse) {
            console.log("JS: Report button clicked for timelapse:", timelapse.name);
            // Show feedback to the user immediately
            self.statusText("Extracting frames...");
            self.isChecking(true);
            // Call the backend to extract frames from this specific video
            OctoPrint.simpleApiCommand("failuredetector", "list_timelapse_frames", { filename: timelapse.name });
        };
        
        // ... (The rest of the modal functions: reportYes, reportNo, modalConfirm, etc. are the same) ...

        // --- SECTION 4: The Single Message Handler ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") return;
            console.log("JS: Message received from backend:", data);
            try {
                if (data.type === 'show_post_print_dialog') { self.openFailureReportModal(); return; }
                
                // --- NEW: Handle the list of recorded timelapses ---
                if (data.type === 'recorded_timelapse_list') {
                    self.recordedTimelapses(data.timelapses);
                    return;
                }
                
                // --- MODIFIED: This now opens the modal ---
                if (data.type === 'frame_list') {
                    self.isChecking(false);
                    self.statusText("Frames loaded.");
                    self.timelapseFrames(data.frames);
                    self.selectedFrameIndex(data.frames.length > 0 ? data.frames.length - 1 : 0);
                    // Now that we have the frames, open the modal
                    self.openFailureReportModal();
                    return;
                }
                
                if (data.snapshot_url) { /* ... unchanged ... */ }
                if (data.status) { /* ... unchanged ... */ }
            } catch (e) { console.error("FailureDetector UI Error:", e); }
        };

        // --- NEW: Automatically load the timelapse list when the UI is ready ---
        self.onAfterBinding = function() {
            self.refreshTimelapseList();
        }
    }

    // ... (The OCTOPRINT_VIEWMODELS.push call is the same) ...
});
