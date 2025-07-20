// octoprint_failuredetector/static/js/failuredetector.js (The Correctly Calling Version)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;
        self.pluginViewModel = parameters[0];
        console.log("FailureDetector MAIN ViewModel initializing...");

        // --- All observables and computeds for the main tab are the same ---
        self.statusText = ko.observable("Failure Detector is Idle.");
        // ... (rest of observables and computeds are the same)

        // --- Actions for Buttons ---
        self.forceCheck = function() {
            console.log("JS Main: 'Force Check' clicked.");
            OctoPrint.simpleApiCommand("failuredetector", "force_check");
        };

        // --- THIS IS THE CRITICAL FIX ---
        // This function now calls the modal by its UNIQUE name.
        self.openFailureReportModal = function() {
            console.log("JS Main: 'Report Failure' clicked. Calling modal by its unique name.");
            self.pluginViewModel.callViewModel("failureDetectorModalViewModel", "open", self.snapshotUrl());
        };

        // --- Message Handler ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            // ... (this function is the same as the last working version)
        };
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: ["plugin_viewmodel"],
        elements: ["#navbar_failuredetector", "#tab_failuredetector"]
    });
});
