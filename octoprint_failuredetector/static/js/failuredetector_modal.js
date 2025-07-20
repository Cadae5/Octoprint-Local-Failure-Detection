// octoprint_failuredetector/static/js/failuredetector_modal.js

$(function() {
    function FailureDetectorModalViewModel(parameters) {
        var self = this;
        console.log("FailureDetector MODAL ViewModel initializing...");

        // --- All the observables and computeds for the modal ---
        self.modalScreen = ko.observable('none');
        self.isFailureReport = ko.observable(true);
        self.failureTypes = ko.observableArray(["Spaghetti", "Layer Shift", "Warping", "Adhesion Failure", "Other"]);
        self.selectedFailureType = ko.observable(self.failureTypes()[0]);
        self.includePrintSettings = ko.observable(true);
        self.acceptDataUse = ko.observable(false);
        self.timelapseFrames = ko.observableArray([]);
        self.selectedFrameIndex = ko.observable(0);
        self.lastSnapshotUrl = ko.observable(null);

        self.modalTitle = ko.computed(function() {
            switch (self.modalScreen()) {
                case 'confirm_failure': return 'Report Print Outcome';
                case 'select_frame': return 'When did the failure start?';
                case 'draw_boxes': return 'Draw Boxes Over Failure';
                case 'final_confirm': return self.isFailureReport() ? "Confirm Failure and Submit" : "Confirm Success and Submit";
                default: return 'Report';
            }
        });
        self.modalConfirmText = ko.computed(function() { return self.modalScreen() === 'draw_boxes' ? 'Skip & Confirm' : (self.modalScreen() === 'final_confirm' ? 'Submit' : 'Next'); });
        self.modalConfirmEnabled = ko.computed(function() { return self.modalScreen() === 'final_confirm' ? self.acceptDataUse() : true; });
        
        self.selectedFramePath = ko.computed(function() {
            if (self.timelapseFrames().length > 0) return self.timelapseFrames()[self.selectedFrameIndex()];
            return null;
        });
        self.selectedFrameUrl = ko.computed(function() {
            if (self.selectedFramePath()) return OctoPrint.options.baseurl + "downloads/timelapse/" + self.selectedFramePath();
            // If we are confirming a success, show the last known snapshot.
            if (self.modalScreen() === 'final_confirm' && !self.isFailureReport()) return self.lastSnapshotUrl();
            return null;
        });
        self.finalFailureTypeText = ko.computed(function() { return "Outcome: " + (self.isFailureReport() ? self.selectedFailureType() : "Success"); });

        // --- This function is called by the main ViewModel to open the modal ---
        self.open = function(snapshotUrl) {
            console.log("JS Modal: 'open' called. Snapshot URL:", snapshotUrl);
            self.lastSnapshotUrl(snapshotUrl);
            self.timelapseFrames([]); // Clear old frames
            self.selectedFrameIndex(0); // Reset slider
            self.acceptDataUse(false); // Reset checkbox
            self.modalScreen('confirm_failure');
            $('#failure_report_modal').modal('show');
        };

        // --- Actions for buttons within the modal ---
        self.reportYes = function() { self.isFailureReport(true); self.modalScreen('select_frame'); OctoPrint.simpleApiCommand("failuredetector", "list_timelapse_frames"); };
        self.reportNo = function() { self.isFailureReport(false); self.modalScreen('final_confirm'); };
        self.modalConfirm = function() {
            var screen = self.modalScreen();
            if (screen === 'select_frame') self.modalScreen('draw_boxes');
            else if (screen === 'draw_boxes') self.modalScreen('final_confirm');
            else if (screen === 'final_confirm') self.submitFinalReport();
        };
        self.modalBack = function() {
            var screen = self.modalScreen();
            if (screen === 'select_frame') self.modalScreen('confirm_failure');
            else if (screen === 'draw_boxes') self.modalScreen('select_frame');
            else if (screen === 'final_confirm') self.isFailureReport() ? self.modalScreen('draw_boxes') : self.modalScreen('confirm_failure');
        };
        self.submitFinalReport = function() {
            var framePath = self.isFailureReport() ? self.selectedFramePath() : self.lastSnapshotUrl().split("/").pop().split("?")[0];
            var payload = {
                failure_type: self.isFailureReport() ? self.selectedFailureType() : "Success",
                failed_frame_path: framePath,
                bounding_boxes: [], // Placeholder for future feature
                include_settings: self.includePrintSettings()
            };
            console.log("JS Modal: Submitting final report with payload:", payload);
            OctoPrint.simpleApiCommand("failuredetector", "upload_failure_data", payload);
            $('#failure_report_modal').modal('hide');
        };

        // --- Message Handler for this ViewModel ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector" || data.type !== 'frame_list') return;
            console.log("JS Modal: Received frame list.", data.frames);
            self.timelapseFrames(data.frames);
            self.selectedFrameIndex(data.frames.length > 0 ? data.frames.length - 1 : 0);
        };
    }

    // Bind this ViewModel and give it a unique name
    OCTOPRINT_VIEWMODELS.push({
        construct: [FailureDetectorModalViewModel, "failureDetectorModalViewModel"],
        dependencies: [],
        elements: ["#failure_report_modal"]
    });
});
