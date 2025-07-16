# __init__.py (Diagnostic Version 3 - Settings Template Test)

import octoprint.plugin

class FailureDetectorPlugin(
    octoprint.plugin.StartupPlugin,
    octoprint.plugin.TemplatePlugin
):
    def on_after_startup(self):
        self._logger.info("--- FailureDetector DIAGNOSTIC 3 has loaded. Testing settings template. ---")

    # This method now loads ONLY the settings template.
    def get_template_configs(self):
        return [
            dict(type="settings", custom_bindings=False)
        ]

# --- All boilerplate is still required ---
__plugin_name__ = "AI Failure Detector"
__plugin_pythoncompat__ = ">=3,<4"

def __plugin_load__():
    global __plugin_implementation__
    __plugin_implementation__ = FailureDetectorPlugin()

    global __plugin_hooks__
    __plugin_hooks__ = {}
