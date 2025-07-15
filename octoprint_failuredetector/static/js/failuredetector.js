// octoprint_failuredetector/static/js/failuredetector.js (Snapshot Version)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;

        self.settingsViewModel = parameters[0];

        // --- Observables for UI state ---
        self.isChecking = ko.observable(false);
        self.lastResult = ko.observable("N/A");
        self.statusText = ko.observable("Failure Detector is Idle");

        // --- NEW: Logic for displaying the snapshot ---
        // This will hold the base URL of the last analyzed snapshot.
        self.snapshotUrl = ko.observable(null); 
        // This is a "cache buster" to force the browser to reload the image.
        self.snapshotTimestamp = ko.observable(new Date().getTime());

        // This computed observable combines the URL and the timestamp.
        // The <img> tag in our HTML will bind to this.
        self.snapshotUrlWithCacheBuster = ko.computed(function() {
            if (self.snapshotUrl()) {
                // Append a timestamp to the URL to prevent browser caching
                return self.snapshotUrl() + "?_t=" + self.snapshotTimestamp();
            }
            return null;
        });

        // --- (statusColor, statusColorNavbar, lastResultText are the same) ---
        self.statusColor = ko.computed(function() { /* ... no changes ... */ });
        self.statusColorNavbar = ko.computed(function() { /* ... no changes ... */ });
        self.lastResultText = ko.computed(function() { /* ... no changes ... */ });

        // --- MODIFIED API Interaction ---
        self.forceCheck = function() {
            if (self.isChecking()) return;
            // When forcing a check, immediately update the image to the latest snapshot
            self.snapshotUrl(self.settingsViewModel.settings.plugins.failuredetector.webcam_snapshot_url());
            self.snapshotTimestamp(new Date().getTime());
            OctoPrint.simpleApiCommand("failuredetector", "force_check");
        };

        // --- MODIFIED Plugin Message Handler ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") { return; }

            // --- NEW: If the message contains a snapshot URL, update our UI ---
            if (data.snapshot_url) {
                self.snapshotUrl(data.snapshot_url);
                self.snapshotTimestamp(new Date().getTime()); // Update timestamp to force reload
            }

            // (The rest of the switch statement logic is the same)
            switch (data.status) {
                 case "checking": /* ... */ break;
                 case "idle": /* ... */ break;
                 case "failure": /* ... */ break;
                 case "error": /* ... */ break;
            }
        };
    }

    // (The OCTOPRINT_VIEWMODELS registration is the same)
    OCTOPRINT_VIEWMODELS.push({ /* ... no changes ... */ });
});
