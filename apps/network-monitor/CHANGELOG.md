# O-System Monitor

## 0.2.0

The app is called **O-System Monitor** now, since it watches far more than the network. Same id, so
an installed copy updates in place.

A new dashboard: a small hardware monitoring station for the machines around you. **Home** shows
CPU, GPU, RAM and network at a glance, each with its own screen and a live graph, and **More**
reaches storage, processes, the device list, settings and a debug view of the raw data. **Home style**
in Settings shows the four as cards with bars, or as rings: a gradient arc round each figure that
eases to every new reading, with network set against the speed of its link. Devices
that go quiet show as offline with the time of their last report.

**Live** shows the computer the Car Thing is plugged into, through a desktop extension that ships
with the app: install it in the bridgething desktop app and allow it. This release reads a Mac
without admin rights: CPU per core and load, memory, GPU load, network speed and Wi-Fi signal, the
drive and its read and write speed, battery health, displays and the busiest processes. It only
works while the app is on screen. Live also lists the Car Thing's own link, measured as before.
**Mock** runs four pretend machines so every screen can be explored without one.

## 0.1.2

The app is called **O-Network Monitor** now, on the store card, on the device and in the tab it
opens in. Nothing else about it changes: same id, same settings, same data, so an installed copy
updates in place and simply reads O-Network Monitor afterwards.

## 0.1.1

An icon of its own for the store and the launcher.

## 0.1.0

First release. Link status, latency, measured download and a 60 second graph.
Upload and local IP report as unavailable: they need interface counters that the
daemon does not expose.
