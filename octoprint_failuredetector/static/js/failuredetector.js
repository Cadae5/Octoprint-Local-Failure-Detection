// octoprint_failuredetector/static/js/failuredetector.js (The Main "Brain" for the primary tab)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;
        // This allows us to call other ViewModels, like our modal.
        self.pluginViewModel = parameters[0];
        console.log("FailureDetector MAIN ViewModel initializing...");

        // --- SECTION 1: Observables (Variables for the Main Tab UI) ---
        self.statusText = ko.observable("Failure Detector is Idle.");
        self.lastResult = ko.observable("N/A");
        self.isChecking = ko.observable(false);
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());

        // --- SECTION 2: Computed Properties (Derived UI Values) ---
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
            if (text.includes("Checking")) return "deepskyblue";
            return "#333";
        });

        self.statusColorNavbar = ko.computed(function() {
            var text = self.statusText();
            if (text.includes("Failure")) return "red";
            if (text.includes("Error")) return "orange";
            if (text.includes("Checking")) return "deepskyblue";
            return "white";
        });

        // --- SECTION 3: Actions (Functions for Buttons) ---
        self.forceCheck = function() {
            console.log("JS Main: 'Force Check' button clicked.");
            OctoPrint.simpleApiCommand("failuredetector", "force_check");
        };

        self.openFailureReportModal = function() {
            console.log("JS Main: 'Report Failure' button clicked. Calling modal ViewModel to open.");
            // This safely finds our other JavaScript "brain" by name and calls its 'open' function,
            // passing the latest snapshot URL as an argument.
            self.pluginViewModel.callViewModel("failureDetectorModal", "open", self.snapshotUrl());
        };

        // --- SECTION 4: Message Handler (Receives data from backend) ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            // We only care about messages for our plugin.
            if (plugin !== "failuredetector") {
                return;
            }

            // This handler only processes status updates for the main tab.
            // It will ignore messages intended for other viewmodels (like 'frame_list').
            if (data.snapshot_url) {
                self.snapshotUrl(data.snapshot_url);
                self.snapshotTimestamp(new Date().getTime());
            }

            if (data.status) {
                switch (data.status) {
                    case "checking":
                        self.isChecking(true);
                        self.statusText("Checking...");
                        break;
                    case "idle":
                        self.isChecking(false);
                        self.statusText("Idle");
                        if (data.result) self.lastResult(data.result);
                        break;
                    case "failure":
                        self.isChecking(false);
                        self.statusText("Failure Detected!");
                        if (data.result) self.lastResult(data.result);
                        break;
                    case "error":
                        self.isChecking(false);
                        self.statusText("Error: " + (data.error || "Unknown"));
                        self.lastResult("Error");
                        break;
                }
            }
        };
    }

    // This binds our ViewModel to the navbar and main tab, and gives it a dependency
    // so it can call other ViewModels.
    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: ["plugin_viewmodel"],
        elements: ["#navbar_failuredetector", "#tab_failuredetector"]
    });
});
