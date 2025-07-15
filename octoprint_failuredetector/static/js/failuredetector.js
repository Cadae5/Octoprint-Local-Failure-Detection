// octoprint_failuredetector/static/js/failuredetector.js (Final Corrected Version)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;
        // We only need the main settings view model to get the snapshot URL
        self.settingsViewModel = parameters[0];

        // --- Observables for UI state ---
        self.isChecking = ko.observable(false);
        self.lastResult = ko.observable("N/A");
        self.statusText = ko.observable("Failure Detector is Idle");
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());

        // --- Computed properties for the UI ---
        self.snapshotUrlWithCacheBuster = ko.computed(function() {
            if (self.snapshotUrl()) {
                return self.snapshotUrl() + "?_t=" + self.snapshotTimestamp();
            }
            return null;
        });

        self.statusColor = ko.computed(function() {
            if (self.statusText().includes("Failure")) return "red";
            if (self.statusText().includes("Error")) return "orange";
            if (self.isChecking()) return "deepskyblue";
            return "#333";
        });
        
        self.statusColorNavbar = ko.computed(function() {
             if (self.statusText().includes("Failure")) return "red";
            if (self.statusText().includes("Error")) return "orange";
            if (self.isChecking()) return "deepskyblue";
            return "white";
        });

        self.lastResultText = ko.computed(function() {
            return "Last check confidence: " + self.lastResult();
        });

        // --- Function to trigger a check ---
        self.forceCheck = function() {
            if (self.isChecking()) return;
            // Get the URL from the main OctoPrint settings
            var url = self.settingsViewModel.settings.plugins.failuredetector.webcam_snapshot_url();
            self.snapshotUrl(url);
            self.snapshotTimestamp(new Date().getTime());
            OctoPrint.simpleApiCommand("failuredetector", "force_check");
        };

        // --- The master message handler ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") {
                return;
            }

            // Update the snapshot URL if the backend sent one
            if (data.snapshot_url) {
                self.snapshotUrl(data.snapshot_url);
                self.snapshotTimestamp(new Date().getTime());
            }

            // Update the status text and icons based on the message
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
                    // We don't need a pop-up here, the red text is enough
                    break;
                case "error":
                    self.isChecking(false);
                    self.statusText("An error occurred: " + data.error);
                    self.lastResult("Error");
                    break;
            }
        };
    }

    // This ViewModel ONLY controls the navbar and tab, NOT the settings panel.
    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: ["settingsViewModel"],
        elements: ["#navbar_failuredetector", "#tab_failuredetector"]
    });
});
