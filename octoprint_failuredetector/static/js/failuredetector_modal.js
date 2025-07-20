// octoprint_failuredetector/static/js/failuredetector_modal.js (The Correctly Named Version)

$(function() {
    function FailureDetectorModalViewModel(parameters) {
        var self = this;
        console.log("FailureDetector MODAL ViewModel initializing...");

        // --- All the observables and computeds for the modal ---
        self.modalScreen = ko.observable('none');
        // ... (rest of the observables and computeds are the same as the last version)

        // --- This function is called by the main ViewModel to open the modal ---
        self.open = function(snapshotUrl) {
            console.log("JS Modal: 'open' function was called. Snapshot URL:", snapshotUrl);
            self.lastSnapshotUrl(snapshotUrl);
            self.modalScreen('confirm_failure');
            $('#failure_report_modal').modal('show');
        };

        // --- Actions for buttons within the modal ---
        self.reportYes = function() { /* ... */ };
        self.reportNo = function() { /* ... */ };
        self.modalConfirm = function() { /* ... */ };
        self.modalBack = function() { /* ... */ };
        self.submitFinalReport = function() { /* ... */ };

        // --- Message Handler for this ViewModel ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector" || data.type !== 'frame_list') return;
            console.log("JS Modal: Received frame list.", data.frames);
            self.timelapseFrames(data.frames);
            self.selectedFrameIndex(data.frames.length > 0 ? data.frames.length - 1 : 0);
        };
    }

    // --- THIS IS THE CRITICAL FIX ---
    // We give our ViewModel a UNIQUE name to avoid conflicts.
    OCTOPRINT_VIEWMODELS.push({
        construct: [FailureDetectorModalViewModel, "failureDetectorModalViewModel"],
        dependencies: [],
        elements: ["#failure_report_modal"]
    });
});
