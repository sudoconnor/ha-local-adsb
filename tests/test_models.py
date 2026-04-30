from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

MODELS_PATH = Path(__file__).parents[1] / "custom_components" / "local_adsb" / "models.py"
spec = importlib.util.spec_from_file_location("local_adsb_models", MODELS_PATH)
models = importlib.util.module_from_spec(spec)
sys.modules["local_adsb_models"] = models
assert spec.loader is not None
spec.loader.exec_module(models)

Aircraft = models.Aircraft
ReceiverData = models.ReceiverData
haversine_miles = models.haversine_miles


def test_aircraft_from_dump1090_computes_distance_and_cleans_callsign():
    aircraft = Aircraft.from_dump1090(
        {
            "hex": "A7E276",
            "flight": "NKS1342 ",
            "lat": 28.312134,
            "lon": -82.299904,
            "altitude": 6350,
            "speed": 272,
            "track": 222,
            "vert_rate": -1728,
            "squawk": "3642",
            "rssi": -26.5,
        },
        home=(28.25, -82.25),
    )

    assert aircraft is not None
    assert aircraft.hex == "a7e276"
    assert aircraft.callsign == "NKS1342"
    assert aircraft.altitude == 6350
    assert aircraft.distance_miles is not None
    assert 4 < aircraft.distance_miles < 6


def test_receiver_metrics_select_nearest_and_lowest():
    far_high = Aircraft(hex="aaa", callsign="HIGH", distance_miles=20, altitude=35000)
    near_low = Aircraft(hex="bbb", callsign="LOW", distance_miles=3, altitude=1800)
    near_mid = Aircraft(hex="ccc", callsign="MID", distance_miles=2, altitude=7000)

    data = ReceiverData(now=1, messages=10, aircraft=(far_high, near_low, near_mid), monitor={})

    assert data.aircraft_visible == 3
    assert data.aircraft_with_position == 0
    assert data.nearest_aircraft == near_mid
    assert data.lowest_aircraft == near_low
    assert data.nearest_low_aircraft(5000) == near_low


def test_haversine_is_reasonable():
    # Rough Zephyrhills to Tampa distance.
    assert 20 < haversine_miles(28.25, -82.25, 27.95, -82.46) < 45
