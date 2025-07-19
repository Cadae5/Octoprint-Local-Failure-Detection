// octoprint_failuredetector/static/js/failuredetector.js (Foundation Version)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;
        // This log proves the script is running.
        console.log("FailureDetector ViewModel initializing (Foundation Version)...");

        // --- SECTION 1: Observables (Variables for the Main Tab UI) ---
        self.statusText = ko.observable("Failure Detector is Idle.");
        self.lastResult = ko.observable("N/A");
        self.isChecking = ko.observable(false);
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());

        // --- SECTION 2: Computed Properties (Derived UI Values) ---
        self.snapshotUrlWithCacheBuster = ko.computed(function() {
            if (self.snapshotUrl()) { return self.snapshotUrl() + "?_t=" + self.snapshotTimestamp(); }
            return null;
        });
        self.lastResultText = ko.computed(function() { return "Last check confidence: " + self.lastResult(); });
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

        // --- SECTION 3: Actions (Functions for Buttons) ---
        self.forceCheck = function() {
            console.log("JS: 'Force Check' button clicked.");
            self.statusText("Sending command...");
            OctoPrint.simpleApiCommand("failuredetector", "force_check");
        };

        // For now, this button only logs a message. This proves it's working.
        self.openFailureReportModal = function() {
            console.log("JS: 'Report Failure' button clicked.");
            alert("The failure reporting modal will be re-enabled in the next step.");
        };

        // --- SECTION 4: Message Handler (Receives data from backend) ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") return;
            console.log("JS: Message received from backend:", data);
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

    // We bind ONLY to the navbar and main tab to ensure stability.
    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: [],
        elements: ["#navbar_failuredetector", "#tab_failuredetector"]
    });
});
