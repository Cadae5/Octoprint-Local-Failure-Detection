// failuredetector.js (Updated for Modal Workflow)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;

        // --- Existing Observables for main tab ---
        self.statusText = ko.observable("Failure Detector is Idle");
        // ... (all other existing observables: lastResult, isChecking, etc.)

        // --- NEW: Observables for the Modal Workflow ---
        self.modalScreen = ko.observable('none'); // e.g., 'confirm_failure', 'select_frame', etc.
        self.modalTitle = ko.observable("Report a Failure");
        
        // Data for the upload
        self.failureTypes = ko.observableArray(["Spaghetti", "Layer Shift", "Warping", "Adhesion Failure", "Other"]);
        self.selectedFailureType = ko.observable(self.failureTypes()[0]);
        self.includePrintSettings = ko.observable(true);
        self.acceptDataUse = ko.observable(false);

        // --- Computed properties to control modal buttons ---
        self.modalBackVisible = ko.computed(function() {
            return self.modalScreen() !== 'confirm_failure';
        });
        self.modalConfirmText = ko.computed(function() {
            if (self.modalScreen() === 'final_confirm') return 'Submit';
            return 'Confirm';
        });
        self.modalConfirmEnabled = ko.computed(function() {
            // Disable submit button until user agrees to data use
            if (self.modalScreen() === 'final_confirm') return self.acceptDataUse();
            return true;
        });

        // --- Functions to control the modal ---
        self.openFailureReportModal = function() {
            // Manually opening the modal always starts at screen 1
            self.modalScreen('confirm_failure');
            self.modalTitle("Did this print fail?");
            $('#failure_report_modal').modal('show');
        };
        
        self.modalConfirm = function() {
            var currentScreen = self.modalScreen();
            if (currentScreen === 'confirm_failure') {
                self.modalScreen('select_frame');
                self.modalTitle("When did the failure start?");
                // In a real version, we would call the API to get timelapse frames here
            } else if (currentScreen === 'select_frame') {
                self.modalScreen('draw_boxes');
                self.modalTitle("Draw Boxes Over Failure");
            } else if (currentScreen === 'draw_boxes') {
                self.modalScreen('final_confirm');
                self.modalTitle("Confirm and Submit");
            } else if (currentScreen === 'final_confirm') {
                // This is the final submit action
                self.submitFinalReport();
                $('#failure_report_modal').modal('hide');
            }
        };

        self.modalBack = function() {
            var currentScreen = self.modalScreen();
            if (currentScreen === 'select_frame') self.modalScreen('confirm_failure');
            if (currentScreen === 'draw_boxes') self.modalScreen('select_frame');
            if (currentScreen === 'final_confirm') self.modalScreen('draw_boxes');
        };

        self.submitFinalReport = function() {
            // This is where you would gather all the data and send it to the backend
            var payload = {
                failure_type: self.selectedFailureType(),
                failed_frame_path: "placeholder.jpg", // From the frame slider
                bounding_boxes: [], // From the drawing canvas
                include_settings: self.includePrintSettings()
            };
            OctoPrint.simpleApiCommand("failuredetector", "upload_failure_data", payload);
        };

        // --- Existing message handler, now with a new case ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") { return; }
            
            // Handle the message to show the popup after a print
            if (data.type === 'show_post_print_dialog') {
                self.openFailureReportModal();
                return;
            }

            // ... (The rest of the existing message handler for status updates)
        };

        // ... (All other existing computed properties and functions for the main tab)
    }

    // Bind the single ViewModel to all our components
    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: [],
        elements: ["#navbar_failuredetector", "#tab_failuredetector", "#failure_report_modal"]
    });
});
