// octoprint_failuredetector/static/js/failuredetector.js (Updated for Tab View)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;

        self.settingsViewModel = parameters[0];

        // --- Observables for UI state ---
        self.isChecking = ko.observable(false);
        self.lastResult = ko.observable("N/A");
        self.statusText = ko.observable("Failure Detector is Idle");

        // --- NEW: Observable for the webcam stream URL ---
        self.webcamStreamUrl = ko.observable(self.settingsViewModel.settings.webcam.streamUrl());

        // --- Computed observables for dynamic UI ---
        self.statusColor = ko.computed(function() {
            if (self.statusText().includes("Failure")) return "red";
            if (self.statusText().includes("Error")) return "orange";
            if (self.isChecking()) return "deepskyblue";
            return "#333"; // Use a darker color for text in the tab
        });

        self.lastResultText = ko.computed(function() {
            return "Last check confidence: " + self.lastResult();
        });

        // --- API Interaction ---
        self.forceCheck = function() {
            if (self.isChecking()) return;
            OctoPrint.simpleApiCommand("failuredetector", "force_check")
                .done(function() {
                    self.statusText("Manual check requested...");
                })
                .fail(function() {
                    self.statusText("Error: Could not send command.");
                });
        };

        // --- Plugin Message Handler ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") {
                return;
            }

            if (data.status === "checking") {
                self.isChecking(true);
                self.statusText("Checking for failure...");
            } else if (data.status === "idle") {
                self.isChecking(false);
                self.statusText("Failure Detector is Idle");
                if (data.result) {
                    self.lastResult(data.result);
                }
            } else if (data.status === "failure") {
                self.isChecking(false);
                self.statusText("Failure Detected! Print paused.");
                if (data.result) {
                    self.lastResult(data.result);
                }
                new PNotify({
                    title: 'Failure Detected!',
                    text: 'The AI detected a print failure with ' + data.result + ' confidence and paused the print.',
                    type: 'error',
                    hide: false
                });
            } else if (data.status === "error") {
                self.isChecking(false);
                self.statusText("An error occurred.");
                self.lastResult("Error");
            }
        };
    }

    // --- THIS IS THE IMPORTANT CHANGE ---
    // Register the ViewModel with all three of our UI components
    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: ["settingsViewModel"],
        elements: [
            "#navbar_failuredetector", 
            "#settings_failuredetector",
            "#tab_failuredetector"  // <-- Add the ID of our new tab
        ]
    });
});
