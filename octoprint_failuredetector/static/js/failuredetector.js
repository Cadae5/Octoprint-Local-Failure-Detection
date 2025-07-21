// octoprint_failuredetector/static/js/failuredetector.js (The Final, Unified, "Bulletproof" Version)

$(function() {
    function FailureDetectorViewModel(parameters) {
        var self = this;
        console.log("FailureDetector UNIFIED ViewModel initializing...");

        // --- SECTION 1: All UI Variables (Observables) ---
        self.statusText = ko.observable("Failure Detector is Idle.");
        self.lastResult = ko.observable("N/A");
        self.isChecking = ko.observable(false);
        self.snapshotUrl = ko.observable(null);
        self.snapshotTimestamp = ko.observable(new Date().getTime());
        self.modalScreen = ko.observable('none');
        self.isFailureReport = ko.observable(true);
        self.failureTypes = ko.observableArray(["Spaghetti", "Layer Shift", "Warping", "Adhesion Failure", "Other"]);
        self.selectedFailureType = ko.observable(self.failureTypes()[0]);
        self.includePrintSettings = ko.observable(true);
        self.acceptDataUse = ko.observable(false);
        self.timelapseFrames = ko.observableArray([]);
        self.selectedFrameIndex = ko.observable(0);
        self.lastSnapshotUrl = ko.observable(null);
        self.recordedTimelapses = ko.observableArray([]);
        self.frameBaseUrl = ko.observable("");

        // --- SECTION 2: All UI Derived Values (Computed) ---
        self.snapshotUrlWithCacheBuster = ko.computed(function() { if (self.snapshotUrl()) return self.snapshotUrl() + "?_t=" + self.snapshotTimestamp(); return null; });
        self.lastResultText = ko.computed(function() { return "Last check confidence: " + self.lastResult(); });
        self.statusColor = ko.computed(function() { /* ... */ });
        self.statusColorNavbar = ko.computed(function() { /* ... */ });
        self.modalTitle = ko.computed(function() { /* ... */ });
        self.modalConfirmText = ko.computed(function() { return self.modalScreen() === 'final_confirm' ? 'Submit' : (self.modalScreen() === 'draw_boxes' ? 'Skip & Confirm' : 'Next'); });
        self.modalConfirmEnabled = ko.computed(function() { return self.modalScreen() === 'final_confirm' ? self.acceptDataUse() : true; });
        self.selectedFramePath = ko.computed(function() { if (self.timelapseFrames().length > 0) return self.timelapseFrames()[self.selectedFrameIndex()]; return null; });
        self.selectedFrameUrl = ko.computed(function() {
            if (self.selectedFramePath()) return OctoPrint.options.baseurl + self.frameBaseUrl() + "/" + self.selectedFramePath();
            if (self.modalScreen() === 'final_confirm' && !self.isFailureReport()) return self.lastSnapshotUrl();
            return null;
        });
        self.finalConfirmTitle = ko.computed(function() { return self.isFailureReport() ? "Confirm Failure and Submit" : "Confirm Success and Submit"; });
        self.finalFailureTypeText = ko.computed(function() { return "Outcome: " + (self.isFailureReport() ? self.selectedFailureType() : "Success"); });

        // --- SECTION 3: All UI Actions (Button Clicks) ---
        self.forceCheck = function() { console.log("JS: 'Force Check' button clicked."); OctoPrint.simpleApiCommand("failuredetector", "force_check"); };
        self.openFailureReportModal = function() {
            self.modalScreen('confirm_failure');
            $('#failure_report_modal').modal('show');
        };
        self.refreshTimelapseList = function() { OctoPrint.simpleApiCommand("failuredetector", "list_recorded_timelapses"); };
        self.reportFailureForTimelapse = function(timelapse) {
            console.log("JS: Report button clicked for timelapse:", timelapse.name);
            self.statusText("Extracting frames...");
            self.isChecking(true);
            OctoPrint.simpleApiCommand("failuredetector", "list_timelapse_frames", { filename: timelapse.name });
        };
        self.reportYes = function() { /* ... */ };
        self.reportNo = function() { /* ... */ };
        self.modalConfirm = function() { /* ... */ };
        self.modalBack = function() { /* ... */ };
        self.submitFinalReport = function() { /* ... */ };

        // --- SECTION 4: The Single Message Handler ---
        self.onDataUpdaterPluginMessage = function(plugin, data) {
            if (plugin !== "failuredetector") return;
            console.log("JS: Message received from backend:", data);
            try {
                if (data.type === 'show_post_print_dialog') { self.openFailureReportModal(); return; }
                if (data.type === 'recorded_timelapse_list') { self.recordedTimelapses(data.timelapses); return; }
                if (data.type === 'frame_list') {
                    self.isChecking(false);
                    self.statusText("Frames loaded.");
                    self.frameBaseUrl(data.base);
                    self.timelapseFrames(data.frames);
                    self.selectedFrameIndex(data.frames.length > 0 ? data.frames.length - 1 : 0);
                    self.openFailureReportModal();
                    return;
                }
                if (data.snapshot_url) { self.snapshotUrl(data.snapshot_url); self.snapshotTimestamp(new Date().getTime()); }
                if (data.status) { /* ... (status update logic) ... */ }
            } catch (e) { console.error("FailureDetector UI Error:", e); }
        };

        self.onAfterBinding = function() {
            self.refreshTimelapseList();
        }
    }

    // This single ViewModel now controls EVERYTHING and has NO dependencies.
    OCTOPRINT_VIEWMODELS.push({
        construct: FailureDetectorViewModel,
        dependencies: [],
        elements: [ "#navbar_failuredetector", "#tab_failuredetector", "#failure_report_modal" ]
    });
});
