// octoprint_failuredetector/static/js/failuredetector_modal.js (The Definitive Reset Version)

$(function() {
    function FailureDetectorModalViewModel(parameters) {
        var self = this;
        console.log("FailureDetector MODAL ViewModel initializing...");

        // --- All observables and computeds for the modal ---
        self.modalScreen = ko.observable('none');
        self.isFailureReport = ko.observable(true);
        self.failureTypes = ko.observableArray(["Spaghetti", "Layer Shift", "Warping", "Adhesion Failure", "Other"]);
        self.selectedFailureType = ko.observable(self.failureTypes()[0]);
        self.includePrintSettings = ko.observable(true);
        self.acceptDataUse = ko.observable(false);
        self.timelapseFrames = ko.observableArray([]);
        self.selectedFrameIndex = ko.observable(0);
        self.lastSnapshotUrl = ko.observable(null); // To store the snapshot URL
        self.modalTitle = ko.computed(function() { /* ... */ });
        self.modalConfirmText = ko.computed(function() { /* ... */ });
        self.modalConfirmEnabled = ko.computed(function() { /* ... */ });
        self.selectedFramePath = ko.computed(function() { /* ... */ });
        self.selectedFrameUrl = ko.computed(function() { /* ... */ });
        self.finalConfirmTitle = ko.computed(function() { /* ... */ });
        self.finalFailureTypeText = ko.computed(function() { /* ... */ });

        // --- This function is called by the main ViewModel to open the modal ---
        self.open = function(snapshotUrl) {
            console.log("JS Modal: 'open' called. Snapshot URL:", snapshotUrl);
            self.lastSnapshotUrl(snapshotUrl);
            self.modalScreen('confirm_failure');
            $('#failure_report_modal').modal('show');
        };

        // --- Actions for buttons within the modal ---
        self.reportYes = function() { self.isFailureReport(true); self.modalScreen('select_frame'); OctoPrint.simpleApiCommand("failuredetector", "list_timelapse_frames"); };
        self.reportNo = function() { self.isFailureReport(false); self.selectedFrameIndex(self.timelapseFrames().length - 1); self.modalScreen('final_confirm'); };
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

    OCTOPRINT_VIEWMODELS.push({
        // We give this ViewModel a name so the main one can find it.
        construct: [FailureDetectorModalViewModel, "plugin_viewmodel"],
        dependencies: [],
        elements: ["#failure_report_modal"]
    });
});
