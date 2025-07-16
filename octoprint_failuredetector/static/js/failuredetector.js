// octoprint_failuredetector/static/js/failuredetector.js (Final Working Version)
$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;
        self.statusText = ko.observable("Failure Detector is Idle");
        self.lastResult = ko.observable("N/A");
        self.isChecking = ko.observable(false);
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());

        self.snapshotUrlWithCacheBuster = ko.computed(function() { /* ... unchanged ... */ });
        self.statusColor = ko.computed(function() { /* ... unchanged ... */ });
        self.statusColorNavbar = ko.computed(function() { /* ... unchanged ... */ });
        self.lastResultText = ko.computed(function() { /* ... unchanged ... */ });

        self.forceCheck = function() { OctoPrint.simpleApiCommand("failuredetector", "force_check"); };

        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") { return; }
            try {
                if (data.snapshot_url) {
                    self.snapshotUrl(data.snapshot_url);
                    self.snapshotTimestamp(new Date().getTime());
                }
                switch (data.status) {
                    case "checking": self.isChecking(true); self.statusText("Checking for failure..."); break;
                    case "idle": self.isChecking(false); self.statusText("Failure Detector is Idle"); if (data.result) self.lastResult(data.result); break;
                    case "failure": self.isChecking(false); self.statusText("Failure Detected!"); if (data.result) self.lastResult(data.result); break;
                    case "error": self.isChecking(false); self.statusText("An error occurred: " + (data.error || "Unknown")); self.lastResult("Error"); break;
                }
            } catch (e) { console.error("FailureDetector Error:", e); }
        };
    }
    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel, dependencies: [],
        elements: ["#navbar_failuredetector", "#tab_failuredetector"]
    });
});
