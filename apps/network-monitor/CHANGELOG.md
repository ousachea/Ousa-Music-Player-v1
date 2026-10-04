# O-System Monitor

## 0.4.0

A third **Home style**, **Widgets**: each reading on a tile of its own colour that fades to black in
one corner. CPU in green with its usage bar and its temperature, or its load where the machine
gives no temperature; memory in blue; the GPU in magenta with its memory bar; network wide along the
bottom with download, upload and ping; and the disk in violet over a row of slats that fill as it
does. A soft light and a pool of shadow drift slowly round each tile, every one at its own pace. A
device without a GPU or CPU reading hands the tile to its battery, and a row with a tile to spare lets
its neighbour stretch rather than leave a gap.

**Processes** reads as a breakdown: each process in a colour of its own, a bar for its share of a
core or of the machine's memory, and a small trend line of its last minute beside it.

**Press the wheel** to put away the bars along the top and bottom, so a screen has the whole display,
and press again to bring them back. On a list the press still chooses.

## 0.3.0

**Windows and Linux** join macOS in Live: install the app in the bridgething desktop app on either
and the computer the Car Thing is plugged into shows up, with nothing to set up and no admin rights.
Windows reads through one PowerShell that stays running while the app is on screen, adds the live
CPU clock, and for an NVIDIA card its temperature, clock, power and fan. Linux reads `/proc` and
`/sys`, and adds CPU, drive and GPU temperatures, which Linux shares freely.

Storage has its own **DISK** tab along the bottom, rather than sitting inside More.

A busy process on several cores now reads past 100%, as Activity Monitor and top show it, where
before it was dropped.

## 0.2.0

The app is called **O-System Monitor** now, since it watches far more than the network. Same id, so
an installed copy updates in place.

A new dashboard: a small hardware monitoring station for the machines around you. **Home** shows
CPU, GPU, RAM and network at a glance, each with its own screen and a live graph, and **More**
reaches storage, processes, the device list, settings and a debug view of the raw data. **Home style**
in Settings shows the four as cards with bars, or as rings: a gradient arc round each figure that
eases to every new reading, with network set against the speed of its link. Devices
that go quiet show as offline with the time of their last report.

**Live**, the default, shows the computer the Car Thing is plugged into, through a desktop extension that ships
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
