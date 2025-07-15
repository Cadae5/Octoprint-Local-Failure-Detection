// octoprint_failuredetector/static/js/failuredetector.js (The Final, Rewritten, Working Version)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;

        // --- 1. Observables: Variables for our UI ---
        // These hold the current state of the plugin.
        self.statusText = ko.observable("Failure Detector is Idle");
        self.lastResult = ko.observable("N/A");
        self.isChecking = ko.observable(false);
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());

        // --- 2. Computed Properties: Combine observables for the UI ---
        // This creates the full image URL with a cache-buster
        self.snapshotUrlWithCacheBuster = ko.computed(function() {
            if (self.snapshotUrl()) {
                return self.snapshotUrl() + "?_t=" + self.snapshotTimestamp();
            }
            return null;
        });

        // This determines the color of the status icons
        self.statusColor = ko.computed(function() {
            var text = self.statusText();
            if (text.includes("Failure")) return "red";
            if (text.includes("Error")) return "orange";
            if (self.isChecking()) return "deepskyblue";
            return "#333"; // Dark gray for the tab
        });
        
        self.statusColorNavbar = ko.computed(function() {
            var text = self.statusText();
            if (text.includes("Failure")) return "red";
            if (text.includes("Error")) return "orange";
            if (self.isChecking()) return "deepskyblue";
            return "white"; // White for the navbar
        });

        // This creates the descriptive text for the last result
        self.lastResultText = ko.computed(function() {
            return "Last check confidence: " + self.lastResult();
        });

        // --- 3. Actions: Functions called by buttons ---
        self.forceCheck = function() {
            // This function ONLY tells the backend to start a check.
            // It does not update the UI directly.
            OctoPrint.simpleApiCommand("failuredetector", "force_check");
        };

        // --- 4. Message Handler: The heart of the UI ---
        // This is the ONLY place where data from the backend updates the UI.
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            // Ensure the message is for our plugin
            if (plugin !== "failuredetector") {
                return;
            }

            // Use a try/catch block as a "safety net" to prevent any errors
            // from crashing the entire OctoPrint UI.
            try {
                // Update the snapshot URL if the backend sent one
                if (data.snapshot_url) {
                    self.snapshotUrl(data.snapshot_url);
                    self.snapshotTimestamp(new Date().getTime()); // Force the image to reload
                }

                // Update the status based on the message from the backend
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
            } catch (e) {
                // If anything goes wrong, log it to the browser's console
                // without crashing the settings panel.
                console.error("FailureDetector Error in onDataUpdaterPluginMessage:", e);
            }
        };
    }

    // This binds our ViewModel to our UI elements WITHOUT any dependencies.
    // This is the key to not conflicting with the settings panel.
    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: [],
        elements: ["#navbar_failuredetector", "#tab_failuredetector"]
    });
});
