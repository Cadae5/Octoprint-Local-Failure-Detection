# setup.py
# A modern, correct setup.py for an OctoPrint plugin

from setuptools import setup, find_packages

# The plugin's identifier, version, and other metadata
plugin_identifier = "failuredetector"
plugin_package = "octoprint_failuredetector"
plugin_name = "AI Failure Detector"
plugin_version = "0.1.0"
plugin_description = "An AI-powered print failure detector that runs locally."
plugin_author = "RickyP"
plugin_author_email = "your_email@example.com"
plugin_url = "https://github.com/YourUsername/Local-Failure-Detection" # Please update this
plugin_license = "AGPLv3"

plugin_requires = [
    "Pillow>=9.0.0",
    "requests",
    "numpy",
]

# The 'entry_points' dictionary tells OctoPrint this is a plugin
entry_points = {
    "octoprint.plugin": [
        f"{plugin_identifier} = {plugin_package}"
    ]
}

setup(
    name=plugin_name,
    version=plugin_version,
    description=plugin_description,
    author=plugin_author,
    author_email=plugin_author_email,
    url=plugin_url,
    license=plugin_license,
    packages=find_packages(),
    install_requires=plugin_requires,
    include_package_data=True, # This tells setup to use MANIFEST.in
    entry_points=entry_points,
)
