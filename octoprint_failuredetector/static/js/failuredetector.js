// octoprint_failuredetector/static/js/failuredetector.js (Final Version with Full Modal Logic)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;

        // --- SECTION 1: Observables (UI Variables) ---
        self.statusText = ko.observable("Failure Detector is Idle.");
        self.lastResult = ko.observable("N/A");
        self.isChecking = ko.observable(false);
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());

        // Modal Workflow
        self.modalScreen = ko.observable('none');
        self.isFailureReport = ko.observable(true);
        self.failureTypes = ko.observableArray(["Spaghetti", "Layer Shift", "Warping", "Adhesion Failure", "Other"]);
        self.selectedFailureType = ko.observable(self.failureTypes()[0]);
        self.includePrintSettings = ko.observable(true);
        self.acceptDataUse = ko.observable(false);
        
        // NEW for frame selection
        self.timelapseFrames = ko.observableArray([]);
        self.selectedFrameIndex = ko.observable(0);

        // --- SECTION 2: Computed Properties (Derived UI Values) ---
        self.snapshotUrlWithCacheBuster = ko.computed(function() { /* ... unchanged ... */ });
        self.lastResultText = ko.computed(function() { /* ... unchanged ... */ });
        self.statusColor = ko.computed(function() { /* ... unchanged ... */ });
        self.statusColorNavbar = ko.computed(function() { /* ... unchanged ... */ });
        self.modalTitle = ko.computed(function() { /* ... unchanged ... */ });
        self.modalConfirmText = ko.computed(function() { return self.modalScreen() === 'draw_boxes' ? 'Skip & Confirm' : (self.modalScreen() === 'final_confirm' ? 'Submit' : 'Next'); });
        self.modalConfirmEnabled = ko.computed(function() { /* ... unchanged ... */ });
        self.finalConfirmTitle = ko.computed(function() { /* ... unchanged ... */ });

        // NEW for frame selection
        self.selectedFramePath = ko.computed(function() {
            if (self.timelapseFrames().length > 0) {
                return self.timelapseFrames()[self.selectedFrameIndex()];
            }
            return null;
        });
        self.selectedFrameUrl = ko.computed(function() {
            if (self.selectedFramePath()) {
                // This URL structure lets OctoPrint serve the timelapse frame
                return OctoPrint.options.baseurl + "downloads/timelapse/" + self.selectedFramePath();
            }
            return null;
        });
        self.finalFailureTypeText = ko.computed(function() {
            return "Failure Type: " + (self.isFailureReport() ? self.selectedFailureType() : "Success");
        });
        
        // --- SECTION 3: Actions (Functions for Buttons) ---
        self.forceCheck = function() { /* ... unchanged ... */ };
        self.openFailureReportModal = function() { /* ... unchanged ... */ };
        self.reportNo = function() { /* ... unchanged ... */ };

        self.reportYes = function() { // User clicked "Yes, it failed"
            self.isFailureReport(true);
            self.modalScreen('select_frame');
            self.statusText("Loading frames..."); // Provide feedback
            OctoPrint.simpleApiCommand("failuredetector", "list_timelapse_frames");
        };
        
        self.modalConfirm = function() { // For the "Next/Skip/Submit" button
            var screen = self.modalScreen();
            if (screen === 'select_frame') self.modalScreen('draw_boxes');
            else if (screen === 'draw_boxes') self.modalScreen('final_confirm');
            else if (screen === 'final_confirm') self.submitFinalReport();
        };
        self.modalBack = function() { /* ... unchanged ... */ };

        self.submitFinalReport = function() {
            var payload = {
                failure_type: self.isFailureReport() ? self.selectedFailureType() : "Success",
                failed_frame_path: self.selectedFramePath() || "last_snapshot.jpg",
                bounding_boxes: [], // Placeholder for future feature
                include_settings: self.includePrintSettings()
            };
            console.log("JS: Submitting final report with payload:", payload);
            OctoPrint.simpleApiCommand("failuredetector", "upload_failure_data", payload);
            $('#failure_report_modal').modal('hide');
        };

        // --- SECTION 4: Message Handler (Receives data from backend) ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") return;
            console.log("JS: Message received from backend:", data);
            try {
                if (data.type === 'show_post_print_dialog') { self.openFailureReportModal(); return; }

                // NEW: Handle the list of frames from the backend
                if (data.type === 'frame_list') {
                    self.timelapseFrames(data.frames);
                    // Start the slider at the end of the print
                    self.selectedFrameIndex(data.frames.length > 0 ? data.frames.length - 1 : 0);
                    self.statusText("Frames loaded.");
                    return;
                }
                
                // ... (rest of message handler is unchanged)
            } catch (e) { console.error("FailureDetector UI Error:", e); }
        };
    }

    OCTOPRINT_VIEWMODELS.push({ /* ... unchanged ... */ });
});
