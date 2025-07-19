// octoprint_failuredetector/static/js/failuredetector.js (The Definitive Reset Version)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;
        self.pluginViewModel = parameters[0]; // For communicating with other viewmodels
        console.log("FailureDetector MAIN ViewModel initializing...");

        // --- All observables and computeds for the main tab ---
        self.statusText = ko.observable("Failure Detector is Idle.");
        self.lastResult = ko.observable("N/A");
        self.isChecking = ko.observable(false);
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());
        self.snapshotUrlWithCacheBuster = ko.computed(function() {
            if (self.snapshotUrl()) return self.snapshotUrl() + "?_t=" + self.snapshotTimestamp();
            return null;
        });
        self.lastResultText = ko.computed(function() { return "Last check confidence: " + self.lastResult(); });
        self.statusColor = ko.computed(function() { /* ... */ });
        self.statusColorNavbar = ko.computed(function() { /* ... */ });

        // --- Actions for Buttons ---
        self.forceCheck = function() {
            console.log("JS Main: 'Force Check' button clicked.");
            OctoPrint.simpleApiCommand("failuredetector", "force_check");
        };

        // This button now sends a message to our other ViewModel
        self.openFailureReportModal = function() {
            console.log("JS Main: 'Report Failure' button clicked. Calling modal...");
            self.pluginViewModel.callViewModel("failureDetectorModal", "open", self.snapshotUrl());
        };

        // --- Message Handler ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") return;
            // This handler only cares about status updates
            if (data.snapshot_url) { self.snapshotUrl(data.snapshot_url); self.snapshotTimestamp(new Date().getTime()); }
            if (data.status) {
                switch (data.status) {
                    case "checking": self.isChecking(true); self.statusText("Checking..."); break;
                    case "idle": self.isChecking(false); self.statusText("Idle"); if (data.result) self.lastResult(data.result); break;
                    case "failure": self.isChecking(false); self.statusText("Failure Detected!"); if (data.result) self.lastResult(data.result); break;
                    case "error": self.isChecking(false); self.statusText("Error: " + data.error); self.lastResult("Error"); break;
                }
            }
        };
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: ["plugin_viewmodel"],
        elements: ["#navbar_failuredetector", "#tab_failuredetector"]
    });
});
