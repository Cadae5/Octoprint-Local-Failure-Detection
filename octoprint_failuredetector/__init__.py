# __init__.py (Updated for Modal Workflow)
# ... (all existing imports are the same)
import glob # For finding timelapse frames

class FailureDetectorPlugin(
    # ... (class definition is the same)
):
    # ... (__init__, on_after_startup, _load_community_credentials, load_model are the same)

    # --- MODIFIED: Remove the old Data Collector tab ---
    def get_template_configs(self):
        return [
            dict(type="settings", custom_bindings=False),
            dict(type="navbar", custom_bindings=False),
            dict(type="tab", name="Failure Detector", custom_bindings=False),
            # The Data Collector tab is now a modal, so we add its template here
            dict(type="generic", template="failuredetector_modal.jinja2")
        ]

    # ... (get_assets is the same)

    # --- MODIFIED: New API commands ---
    def get_api_commands(self):
        return dict(
            force_check=[],
            list_timelapse_frames=[], # New command to get frame URLs
            upload_failure_data=[ # Expanded to accept more data
                "failure_type", "failed_frame_path", 
                "bounding_boxes", "include_settings"
            ]
        )

    def on_api_command(self, command, data):
        if command == "force_check":
            # ... (this is the same)
        
        elif command == "list_timelapse_frames":
            self._logger.info("Listing timelapse frames...")
            timelapse_dir = self._settings.global_get_folder("timelapse")
            # Find all JPGs, sort them, and return them as a list
            frames = sorted(glob.glob(os.path.join(timelapse_dir, "*.jpg")))
            # We need to expose these files to the web, so we need a different approach.
            # For now, we will return a placeholder. The real implementation is more complex.
            # This is a known hard problem in OctoPrint plugin development.
            # We'll focus on the UI flow first.
            self._plugin_manager.send_plugin_message(self._identifier, {"type": "frame_list", "frames": []})

        elif command == "upload_failure_data":
            # The data object will now contain much more information from the modal
            self._logger.info(f"Received upload request with data: {data}")
            upload_thread = threading.Thread(target=self._upload_to_database, args=(data,))
            upload_thread.daemon = True
            upload_thread.start()

    # --- MODIFIED: Event handler to trigger popup ---
    def on_event(self, event, payload):
        if event == "PrintStarted":
            # ... (this is the same)
        elif event in ("PrintCancelled"):
            # ... (this is the same)
        # We now handle PrintDone separately
        elif event == "PrintDone":
            self._logger.info("Print finished. Triggering failure report dialog.")
            self.is_printing = False
            # Send a message to the frontend to show the "Did it fail?" popup
            self._plugin_manager.send_plugin_message(self._identifier, {"type": "show_post_print_dialog"})

    # ... (detection_loop, perform_check, _upload_to_database are the same) ...
    # Note: _upload_to_database will need to be updated to use the new `data` fields.
    
    # ... (get_update_information and final boilerplate are the same) ...
