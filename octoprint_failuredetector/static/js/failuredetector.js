// octoprint_failuredetector/static/js/failuredetector.js (Corrected for Real This Time)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;

        // We still need settingsViewModel to get the webcam URL for our tab
        self.settingsViewModel = parameters[0];

        // --- Observables for UI state ---
        self.isChecking = ko.observable(false);
        self.lastResult = ko.observable("N/A");
        self.statusText = ko.observable("Failure Detector is Idle");

        // Correctly access the webcam stream URL from the main settings view model
        self.webcamStreamUrl = ko.observable(self.settingsViewModel.webcam.streamUrl());

        // --- Computed observables for dynamic UI ---
        self.statusColor = ko.computed(function() {
            if (self.statusText().includes("Failure")) return "red";
            if (self.statusText().includes("Error")) return "orange";
            if (self.isChecking()) return "deepskyblue";
            return "#333"; // Using a dark gray for tab text, white for navbar
        });
        
        self.statusColorNavbar = ko.computed(function() {
             if (self.statusText().includes("Failure")) return "red";
            if (self.statusText().includes("Error")) return "orange";
            if (self.isChecking()) return "deepskyblue";
            return "white"; // Always white for the navbar
        });

        self.lastResultText = ko.computed(function() {
            return "Last check confidence: " + self.lastResult();
        });

        // --- API Interaction ---
        self.forceCheck = function() {
            if (self.isChecking()) return;
            OctoPrint.simpleApiCommand("failuredetector", "force_check");
        };

        // --- Plugin Message Handler ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") { return; }

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
                    self.statusText("Failure Detected! Print paused.");
                    if (data.result) self.lastResult(data.result);
                    new PNotify({
                        title: 'Failure Detected!',
                        text: 'The AI detected a print failure with ' + data.result + ' confidence and paused the print.',
                        type: 'error',
                        hide: false
                    });
                    break;
                case "error":
                    self.isChecking(false);
                    self.statusText("An error occurred during check.");
                    self.lastResult("Error");
                    break;
            }
        };
    }

    // --- THE CRITICAL FIX IS HERE ---
    // We REMOVE "#settings_failuredetector" from the list of elements.
    // Our ViewModel no longer controls the settings panel.
    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: ["settingsViewModel"],
        elements: [
            "#navbar_failuredetector",
            "#tab_failuredetector"
            // "#settings_failuredetector" <-- THIS LINE IS GONE
        ]
    });
});
