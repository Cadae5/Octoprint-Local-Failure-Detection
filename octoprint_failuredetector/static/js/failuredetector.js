// octoprint_failuredetector/static/js/failuredetector.js (The New, Simpler Foundation)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;
        console.log("FailureDetector MAIN ViewModel initializing...");

        // --- All the observables and computeds for the main tab are the same ---
        self.statusText = ko.observable("Failure Detector is Idle.");
        self.lastResult = ko.observable("N/A");
        self.isChecking = ko.observable(false);
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());
        self.snapshotUrlWithCacheBuster = ko.computed(function() { /* ... */ });
        self.lastResultText = ko.computed(function() { /* ... */ });
        self.statusColor = ko.computed(function() { /* ... */ });
        self.statusColorNavbar = ko.computed(function() { /* ... */ });
        self.callViewModel = parameters[0].callViewModel;

        // --- Actions for Buttons ---
        self.forceCheck = function() {
            console.log("JS Main: 'Force Check' clicked.");
            OctoPrint.simpleApiCommand("failuredetector", "force_check");
        };

        // --- THIS IS THE KEY CHANGE ---
        // This function now finds the modal's ViewModel and calls its 'open' function.
        self.openFailureReportModal = function() {
            console.log("JS Main: 'Report Failure' clicked. Calling modal ViewModel.");
            self.callViewModel("failureDetectorModal", "open", self.snapshotUrl());
        };

        // --- Message Handler ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") return;
            // This handler only cares about status updates now
            if (data.snapshot_url) { self.snapshotUrl(data.snapshot_url); self.snapshotTimestamp(new Date().getTime()); }
            if (data.status) { /* ... (status update logic is the same) ... */ }
        };
    }

    OCTOPRINT_VIEWMODELS.push({
        // We give this ViewModel a name so the modal can find it.
        construct: [FailureDetectorViewModel, "PluginViewModel"],
        dependencies: ["plugin_viewmodel"],
        elements: ["#navbar_failuredetector", "#tab_failuredetector"]
    });
});
