// octoprint_failuredetector/static/js/failuredetector_modal.js

$(function() {
    function FailureDetectorModalViewModel(parameters) {
        var self = this;
        console.log("FailureDetector MODAL ViewModel initializing...");

        // --- Observables for the Modal Workflow ---
        self.modalScreen = ko.observable('none');
        self.isFailureReport = ko.observable(true);
        self.failureTypes = ko.observableArray(["Spaghetti", "Layer Shift", "Warping", "Adhesion Failure", "Other"]);
        self.selectedFailureType = ko.observable(self.failureTypes()[0]);
        self.includePrintSettings = ko.observable(true);
        self.acceptDataUse = ko.observable(false);
        self.timelapseFrames = ko.observableArray([]);
        self.selectedFrameIndex = ko.observable(0);
        self.lastSnapshotUrl = ko.observable(null); // To store the snapshot URL

        // --- Computed Properties for the Modal UI ---
        self.modalTitle = ko.computed(function() { /* ... unchanged ... */ });
        self.modalConfirmText = ko.computed(function() { /* ... unchanged ... */ });
        self.modalConfirmEnabled = ko.computed(function() { return self.modalScreen() === 'final_confirm' ? self.acceptDataUse() : true; });
        self.selectedFramePath = ko.computed(function() { /* ... unchanged ... */ });
        self.selectedFrameUrl = ko.computed(function() { /* ... unchanged ... */ });
        self.finalConfirmTitle = ko.computed(function() { /* ... unchanged ... */ });
        self.finalFailureTypeText = ko.computed(function() { /* ... unchanged ... */ });
        
        // --- This function is called from other ViewModels to open the modal ---
        self.open = function(snapshotUrl) {
            console.log("JS Modal: 'open' called. Snapshot URL:", snapshotUrl);
            self.lastSnapshotUrl(snapshotUrl);
            self.modalScreen('confirm_failure');
            $('#failure_report_modal').modal('show');
        };

        // --- Actions for Buttons within the modal ---
        self.reportYes = function() { self.isFailureReport(true); self.modalScreen('select_frame'); OctoPrint.simpleApiCommand("failuredetector", "list_timelapse_frames"); };
        self.reportNo = function() { self.isFailureReport(false); self.selectedFrameIndex(self.timelapseFrames().length - 1); self.modalScreen('final_confirm'); };
        self.modalConfirm = function() { /* ... unchanged ... */ };
        self.modalBack = function() { /* ... unchanged ... */ };
        self.submitFinalReport = function() { /* ... unchanged ... */ };

        // --- Message Handler for this ViewModel ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") return;
            // This handler only cares about the frame list
            if (data.type === 'frame_list') {
                console.log("JS Modal: Received frame list.", data.frames);
                self.timelapseFrames(data.frames);
                self.selectedFrameIndex(data.frames.length > 0 ? data.frames.length - 1 : 0);
            }
        };

        // This allows other ViewModels to call our 'open' function
        self.onViewModelsInitialized = function() {
            self.callViewModel = parameters[0].callViewModel;
        };
    }

    // Bind this ViewModel ONLY to the modal element
    OCTOPRINT_VIEWMODELS.push({
        construct: [FailureDetectorModalViewModel, ["plugin_viewmodel"]],
        dependencies: [],
        elements: ["#failure_report_modal"]
    });
});
