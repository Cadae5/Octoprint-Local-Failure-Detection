// octoprint_failuredetector/static/js/failuredetector.js (Final Version with Diagnostics)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;

        // --- UI Variables ---
        self.statusText = ko.observable("Failure Detector is Idle");
        self.lastResult = ko.observable("N/A");
        self.isChecking = ko.observable(false);
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());

        // --- UI Computed Properties ---
        self.snapshotUrlWithCacheBuster = ko.computed(function() {
            if (self.snapshotUrl()) {
                return self.snapshotUrl() + "?_t=" + self.snapshotTimestamp();
            }
            return null;
        });

        self.lastResultText = ko.computed(function() {
            return "Last check confidence: " + self.lastResult();
        });

        self.statusColor = ko.computed(function() {
            var text = self.statusText();
            if (text.includes("Failure")) return "red";
            if (text.includes("Error")) return "orange";
            if (self.isChecking()) return "deepskyblue";
            return "#333";
        });
        
        self.statusColorNavbar = ko.computed(function() {
            var text = self.statusText();
            if (text.includes("Failure")) return "red";
            if (text.includes("Error")) return "orange";
            if (self.isChecking()) return "deepskyblue";
            return "white";
        });

        // --- UI Actions ---
        self.forceCheck = function() {
            OctoPrint.simpleApiCommand("failuredetector", "force_check");
        };

        // --- THIS IS THE MOST IMPORTANT PART ---
        // This function listens for messages from the backend.
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            // We only care about messages for our plugin.
            if (plugin !== "failuredetector") {
                return;
            }

            // --- THE CRITICAL DIAGNOSTIC LINE ---
            // This will print the raw data received from the backend into the browser's console.
            console.log("FailureDetector plugin received data:", data);

            // Now, we update the UI based on the received data.
            try {
                if (data.snapshot_url) {
                    self.snapshotUrl(data.snapshot_url);
                    self.snapshotTimestamp(new Date().getTime());
                }
                if (data.result) {
                    self.lastResult(data.result);
                }
                if (data.status === "checking") {
                    self.isChecking(true);
                    self.statusText("Checking for failure...");
                } else if (data.status === "idle") {
                    self.isChecking(false);
                    self.statusText("Failure Detector is Idle");
                } else if (data.status === "failure") {
                    self.isChecking(false);
                    self.statusText("Failure Detected!");
                } else if (data.status === "error") {
                    self.isChecking(false);
                    self.statusText("An error occurred: " + (data.error || "Unknown"));
                }
            } catch (e) {
                console.error("FailureDetector UI failed to update:", e);
            }
        };
    }

    // This binds our ViewModel to our UI elements.
    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: [],
        elements: ["#navbar_failuredetector", "#tab_failuredetector"]
    });
});
