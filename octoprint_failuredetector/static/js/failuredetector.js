// octoprint_failuredetector/static/js/failuredetector.js (Final Working Modal Logic)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;

        // --- Observables for main tab ---
        self.statusText = ko.observable("Failure Detector is Idle");
        self.lastResult = ko.observable("N/A");
        self.isChecking = ko.observable(false);
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());

        // --- Observables for the Modal Workflow ---
        self.modalScreen = ko.observable('none');
        self.modalTitle = ko.observable("");
        self.isFailureReport = ko.observable(true); // To track if it's a failure or success
        
        self.failureTypes = ko.observableArray(["Spaghetti", "Layer Shift", "Warping", "Adhesion Failure", "Other"]);
        self.selectedFailureType = ko.observable(self.failureTypes()[0]);
        self.includePrintSettings = ko.observable(true);
        self.acceptDataUse = ko.observable(false);

        // --- Computed Properties ---
        self.snapshotUrlWithCacheBuster = ko.computed(function() { /* ... unchanged ... */ });
        self.lastResultText = ko.computed(function() { /* ... unchanged ... */ });
        self.statusColor = ko.computed(function() { /* ... unchanged ... */ });
        self.statusColorNavbar = ko.computed(function() { /* ... unchanged ... */ });

        self.finalConfirmTitle = ko.computed(function() {
            return self.isFailureReport() ? "Confirm Failure and Submit" : "Confirm Success and Submit";
        });
        self.modalConfirmText = ko.computed(function() {
            if (self.modalScreen() === 'final_confirm') return 'Submit';
            return 'Next';
        });
        self.modalConfirmEnabled = ko.computed(function() {
            if (self.modalScreen() === 'final_confirm') return self.acceptDataUse();
            return true;
        });

        // --- Functions to control the modal ---
        self.openFailureReportModal = function() {
            self.modalScreen('confirm_failure');
            self.modalTitle("Report Print Outcome");
            $('#failure_report_modal').modal('show');
        };

        self.reportYes = function() { // User clicked "Yes, it failed"
            self.isFailureReport(true);
            self.modalScreen('select_frame');
            self.modalTitle("When did the failure start?");
        };

        self.reportNo = function() { // User clicked "No, it was a success"
            self.isFailureReport(false);
            self.modalScreen('final_confirm');
            self.modalTitle("Confirm Success");
        };
        
        self.modalConfirm = function() { // For the "Next" button in the footer
            var currentScreen = self.modalScreen();
            if (currentScreen === 'select_frame') self.modalScreen('draw_boxes');
            else if (currentScreen === 'draw_boxes') self.modalScreen('final_confirm');
            else if (currentScreen === 'final_confirm') self.submitFinalReport();
        };

        self.modalBack = function() {
            var currentScreen = self.modalScreen();
            if (currentScreen === 'select_frame') self.modalScreen('confirm_failure');
            else if (currentScreen === 'draw_boxes') self.modalScreen('select_frame');
            else if (currentScreen === 'final_confirm') {
                // If it was a failure, go back to drawing, otherwise go back to start
                self.isFailureReport() ? self.modalScreen('draw_boxes') : self.modalScreen('confirm_failure');
            }
        };

        self.submitFinalReport = function() {
            var finalFailureType = self.isFailureReport() ? self.selectedFailureType() : "Success";
            var payload = {
                failure_type: finalFailureType,
                failed_frame_path: "placeholder.jpg",
                bounding_boxes: [],
                include_settings: self.includePrintSettings()
            };
            OctoPrint.simpleApiCommand("failuredetector", "upload_failure_data", payload);
            $('#failure_report_modal').modal('hide');
        };

        // --- Main Message Handler ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            // ... (This function is unchanged from the last working version)
        };
    }

    // Bind the single ViewModel to all our components
    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: [],
        elements: ["#navbar_failuredetector", "#tab_failuredetector", "#failure_report_modal"]
    });
});
