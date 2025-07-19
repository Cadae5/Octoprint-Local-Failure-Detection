// octoprint_failuredetector/static/js/failuredetector.js (The "Bare-Metal Reset" Version)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;
        // This log is our proof that the script is running AT ALL.
        console.log("FailureDetector ViewModel initializing (Bare-Metal Reset)...");

        // --- SECTION 1: Variables for the UI ---
        self.statusText = ko.observable("Failure Detector is Idle.");
        self.lastResult = ko.observable("N/A");
        self.isChecking = ko.observable(false);
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());

        // --- SECTION 2: Values Derived from Variables ---
        self.snapshotUrlWithCacheBuster = ko.computed(function() {
            if (self.snapshotUrl()) return self.snapshotUrl() + "?_t=" + self.snapshotTimestamp();
            return null;
        });
        self.lastResultText = ko.computed(function() { return "Last check confidence: " + self.lastResult(); });
        self.statusColor = ko.computed(function() { /* ... */ }); // Unchanged
        self.statusColorNavbar = ko.computed(function() { /* ... */ }); // Unchanged

        // --- SECTION 3: Functions for Buttons ---
        self.forceCheck = function() {
            // This log proves the button click is connected to this function.
            console.log("JS: 'Force Check' button clicked. Sending command to backend.");
            self.isChecking(true); // Provide immediate feedback
            self.statusText("Sending command...");
            OctoPrint.simpleApiCommand("failuredetector", "force_check");
        };

        self.reportFailure = function() {
            // This button is intentionally simple for now.
            console.log("JS: 'Report Failure' button clicked.");
            alert("This will open the failure reporting modal in a future step.");
        };

        // --- SECTION 4: Function to Receive Backend Messages ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") return;
            console.log("JS: Message received from backend:", data); // Proof that backend is communicating
            try {
                if (data.snapshot_url) { self.snapshotUrl(data.snapshot_url); self.snapshotTimestamp(new Date().getTime()); }
                if (data.status) {
                    switch (data.status) {
                        case "checking": self.isChecking(true); self.statusText("Checking..."); break;
                        case "idle": self.isChecking(false); self.statusText("Idle"); if (data.result) self.lastResult(data.result); break;
                        case "failure": self.isChecking(false); self.statusText("Failure Detected!"); if (data.result) self.lastResult(data.result); break;
                        case "error": self.isChecking(false); self.statusText("Error: " + data.error); self.lastResult("Error"); break;
                    }
                }
            } catch (e) { console.error("FailureDetector UI Error:", e); }
        };
    }

    // We bind ONLY to the navbar and main tab to guarantee stability.
    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: [],
        elements: ["#navbar_failuredetector", "#tab_failuredetector"]
    });
});
