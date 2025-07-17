// octoprint_failuredetector/static/js/failuredetector.js (The New Unified Version)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;

        // --- Observables from the Failure Detector Tab ---
        self.statusText = ko.observable("Failure Detector is Idle");
        self.lastResult = ko.observable("N/A");
        self.isChecking = ko.observable(false);
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());
        
        // --- Observables from the Data Collector Tab ---
        self.failureTypes = ko.observableArray(["Spaghetti", "Layer Shift", "Warping", "Adhesion Failure", "Other"]);
        self.selectedFailureType = ko.observable(self.failureTypes()[0]);
        self.uploadStatus = ko.observable("");
        self.isUploading = ko.observable(false);

        // --- Computed Properties for the UI ---
        self.snapshotUrlWithCacheBuster = ko.computed(function() {
            if (self.snapshotUrl()) { return self.snapshotUrl() + "?_t=" + self.snapshotTimestamp(); }
            return null;
        });
        self.lastResultText = ko.computed(function() { return "Last check confidence: " + self.lastResult(); });
        self.statusColor = ko.computed(function() { /* ... no changes needed ... */ });
        self.statusColorNavbar = ko.computed(function() { /* ... no changes needed ... */ });
        self.uploadEnabled = ko.computed(function() { return !self.isUploading(); });

        // --- Actions for Buttons ---
        self.forceCheck = function() {
            OctoPrint.simpleApiCommand("failuredetector", "force_check");
        };

        self.uploadFailure = function() {
            self.isUploading(true);
            self.uploadStatus("Sending to backend...");
            var payload = { failure_type: self.selectedFailureType() };
            OctoPrint.simpleApiCommand("failuredetector", "upload_failure_data", payload)
                .done(function(response) {
                    self.uploadStatus(response.message || "Upload signal sent!");
                    setTimeout(function() { self.uploadStatus(""); }, 5000);
                })
                .fail(function() { self.uploadStatus("Error: Command failed."); })
                .always(function() { self.isUploading(false); });
        };

        // --- Main Message Handler ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") { return; }
            try {
                if (data.snapshot_url) {
                    self.snapshotUrl(data.snapshot_url);
                    self.snapshotTimestamp(new Date().getTime());
                }
                if (data.status) { // Handle status updates for the detection tab
                    switch (data.status) {
                        case "checking": self.isChecking(true); self.statusText("Checking for failure..."); break;
                        case "idle": self.isChecking(false); self.statusText("Failure Detector is Idle"); if (data.result) self.lastResult(data.result); break;
                        case "failure": self.isChecking(false); self.statusText("Failure Detected!"); if (data.result) self.lastResult(data.result); break;
                        case "error": self.isChecking(false); self.statusText("An error occurred: " + (data.error || "Unknown")); self.lastResult("Error"); break;
                    }
                }
                if (data.message) { // Handle simple string messages for the collector tab
                    self.uploadStatus(data.message);
                }
            } catch (e) { console.error("FailureDetector UI Error:", e); }
        };
    }

    // This single ViewModel now controls ALL THREE of our UI components.
    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: [],
        elements: [
            "#navbar_failuredetector", 
            "#tab_failuredetector",
            "#datacollector_tab" // Add the new tab's ID here
        ]
    });
});
