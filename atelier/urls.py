from django.urls import path
from django.views.generic import RedirectView

from . import api, views

urlpatterns = [
    path("", views.landing, name="landing"),
    path("pipeline/", views.pipeline, name="pipeline"),
    path("storyboard/", views.storyboard, name="storyboard"),
    path("skills/", views.skills, name="skills"),
    path("skills/<slug:key>/", views.skills, name="skill"),
    path("board/", views.board, name="board"),
    path("bench/", views.bench, name="bench"),
    path("runs/<slug:run_id>/", views.run, name="run"),
    path("drift/", views.drift, name="drift"),
    path("frames/<slug:vid>/<str:name>", views.frame, name="frame"),
    path("api/state.json", api.state, name="api_state"),
    # The app, in the order a new user sees it: welcome, accounts, video, progress.
    path("start/", views.start, name="start"),
    path("welcome/", views.welcome, name="welcome"),
    path("setup/", views.keys, name="keys"),
    path("new/", views.new, name="new"),
    path("new/dolibarr/", views.dolibarr_start, name="dolibarr_start"),
    path("keys/", RedirectView.as_view(pattern_name="keys", permanent=False)),
    path("start/dolibarr/", RedirectView.as_view(pattern_name="dolibarr_start", permanent=False)),
    path("projects/<slug:pid>/", views.project, name="project"),
    path("projects/<slug:pid>/SKILL.md", views.project_skill, name="project_skill"),
    path("projects/<slug:pid>/frames/<str:name>", views.project_frame, name="project_frame"),
]
