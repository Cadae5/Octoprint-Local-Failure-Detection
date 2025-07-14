// octoprint_failuredetector/static/js/failuredetector.js

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;

        self.settings = parameters[0];

        // --- Observables for UI state ---
        // Is the plugin currently running a check?
        self.isChecking = ko.observable(false);
        // The text result of the last check (e.g., "85.34%")
        self.lastResult = ko.observable("N/A");
        // A descriptive status text for tooltips
        self.statusText = ko.observable("Failure Detector is Idle");

        // --- Computed observables for dynamic UI ---
        // Dynamically changes the color of the navbar icon
        self.statusColor = ko.computed(function() {
            if (self.statusText().includes("Failure")) return "red";
            if (self.statusText().includes("Error")) return "orange";
            if (self.isChecking()) return "deepskyblue";
            return "white"; // Default color
        });

        // Text shown in the settings panel next to the button
        self.lastResultText = ko.computed(function() {
            return "Last check result: " + self.lastResult();
        });

        // --- API Interaction ---
        // Sends a command to the backend to force a check
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
        // This function receives messages sent from the Python backend
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") {
                return;
            }

            // Update UI based on the message content
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
                    hide: false // Keep the notification until the user closes it
                });
            } else if (data.status === "error") {
                self.isChecking(false);
                self.statusText("An error occurred.");
                self.lastResult("Error");
            }
        };
    }

    // Register the ViewModel with OctoPrint
    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: ["settingsViewModel"],
        elements: ["#navbar_failuredetector", "#settings_failuredetector"]
    });
});
