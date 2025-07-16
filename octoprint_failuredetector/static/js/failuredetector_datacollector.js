// failuredetector_datacollector.js

$(function() {
    function DataCollectorViewModel(parameters) {
        var self = this;
        // We get the main ViewModel as a dependency to share the snapshot URL
        var mainViewModel = parameters[0];

        // --- UI Observables ---
        self.failureTypes = ko.observableArray(["Spaghetti", "Layer Shift", "Warping", "Adhesion Failure", "Other"]);
        self.selectedFailureType = ko.observable(self.failureTypes()[0]);
        self.uploadStatus = ko.observable("");
        self.isUploading = ko.observable(false);

        // --- Computed Properties ---
        // Enable the upload button only if not currently uploading
        self.uploadEnabled = ko.computed(function() {
            return !self.isUploading();
        });

        // This shares the snapshot URL from the main plugin's ViewModel
        self.snapshotUrlWithCacheBuster = mainViewModel.snapshotUrlWithCacheBuster;

        // --- Actions ---
        self.uploadFailure = function() {
            self.isUploading(true);
            self.uploadStatus("Uploading...");

            var payload = {
                failure_type: self.selectedFailureType()
            };

            OctoPrint.simpleApiCommand("failuredetector", "upload_failure_data", payload)
                .done(function(response) {
                    self.uploadStatus(response.message);
                    // Fade out the message after a few seconds
                    setTimeout(function() { self.uploadStatus(""); }, 5000);
                })
                .fail(function() {
                    self.uploadStatus("Error: Failed to send command.");
                })
                .always(function() {
                    self.isUploading(false);
                });
        };
    }

    // Register this ViewModel with OctoPrint
    OCTOPRINT_VIEWMODELS.push({
        construct: DataCollectorViewModel,
        // This is important: it depends on our main ViewModel
        dependencies: ["failureDetectorViewModel"],
        elements: ["#datacollector_tab"]
    });
});
