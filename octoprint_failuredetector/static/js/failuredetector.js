// octoprint_failuredetector/static/js/failuredetector.js (The Final Decoupled Version)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;

        // --- Observables for UI state (No changes here) ---
        self.isChecking = ko.observable(false);
        self.lastResult = ko.observable("N/A");
        self.statusText = ko.observable("Failure Detector is Idle");
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());

        // --- Computed properties for the UI (No changes here) ---
        self.snapshotUrlWithCacheBuster = ko.computed(function() {
            if (self.snapshotUrl()) {
                return self.snapshotUrl() + "?_t=" + self.snapshotTimestamp();
            }
            return null;
        });

        self.statusColor = ko.computed(function() { /* ... No changes ... */ });
        self.statusColorNavbar = ko.computed(function() { /* ... No changes ... */ });
        self.lastResultText = ko.computed(function() { /* ... No changes ... */ });

        // --- Function to trigger a check (Simplified) ---
        self.forceCheck = function() {
            if (self.isChecking()) return;
            // This function no longer needs to know the URL.
            // It just tells the backend to start a check.
            // The backend will handle getting the URL and sending it back.
            OctoPrint.simpleApiCommand("failuredetector", "force_check");
        };

        // --- The master message handler (No changes here) ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") { return; }

            // Update the snapshot URL if the backend sent one
            if (data.snapshot_url) {
                self.snapshotUrl(data.snapshot_url);
                self.snapshotTimestamp(new Date().getTime());
            }

            // Update the status text and icons
            switch (data.status) {
                case "checking":
                    self.isChecking(true);
                    self.statusText("Checking for failure...");
                    break;
                case "idle":
                    self.isChecking(false);
                    self.statusText("Failure Detector is Idle");
                    if (data.result) self.lastResult(data.result);
                    break;
                case "failure":
                    self.isChecking(false);
                    self.statusText("Failure Detected!");
                    if (data.result) self.lastResult(data.result);
                    break;
                case "error":
                    self.isChecking(false);
                    self.statusText("An error occurred: " + (data.error || "Unknown"));
                    self.lastResult("Error");
                    break;
            }
        };
    }

    // --- THIS IS THE CRITICAL FIX ---
    // The dependency list is now EMPTY. Our ViewModel is fully independent.
    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: [], // <-- NO MORE "settingsViewModel"
        elements: ["#navbar_failuredetector", "#tab_failuredetector"]
    });
});
