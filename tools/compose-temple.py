"""Render the original 20-second cue 过桥听雨. Run with Python, NumPy, SciPy and FFmpeg."""
from pathlib import Path
import subprocess
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

RATE = 48000
SECONDS = 20
rng = np.random.default_rng(53942)
mix = np.zeros((RATE * SECONDS, 2))
room_send = np.zeros_like(mix)


def put(at, signal, pan, send):
    start = round(RATE * at)
    count = min(len(signal), len(mix) - start)
    gains = np.sqrt(np.array([1 - pan, 1 + pan]) / 2)
    stereo = signal[:count, None] * gains
    mix[start:start + count] += stereo
    room_send[start:start + count] += stereo * send


def hz(note):
    return 440 * 2 ** ((note - 69) / 12)


def band(signal, lower, upper):
    return sosfilt(butter(2, [lower, upper], btype='bandpass', fs=RATE, output='sos'), signal)


def qin(at, note, strength, slide=0, harmonic=False):
    # A pluck close to the bridge excites different partials from a brushed
    # harmonic. High partials fall away first. Only stopped notes slide.
    t = np.arange(round(RATE * 3.7)) / RATE
    bend = slide * np.clip((t - .19) / .38, 0, 1) ** 1.4
    bend += .043 * np.sin(2 * np.pi * 4.3 * t) * (1 - np.exp(-t * 3))
    phase = 2 * np.pi * np.cumsum(hz(note) * 2 ** (bend / 12)) / RATE
    tone = np.zeros_like(t)
    for k in range(1, 17):
        excitation = np.sin(np.pi * k * (.27 if harmonic else .16))
        envelope = np.exp(-t * (.95 + .43 * k ** 1.25))
        tone += excitation * envelope * np.sin(phase * k * (1 + .000038 * k * k)) / k ** 1.13
    nail = band(rng.normal(size=len(t)), 1100, 5200) * np.exp(-t * 95)
    wooden_body = band(tone, 320, 790)
    signal = (tone + .16 * wooden_body + .052 * nail) * (1 - np.exp(-t * 320))
    put(at, signal * strength * .48, -.33, .48)


def xiao(at, notes, strength):
    # Each contour is played on one breath. Portamento at the end of a note
    # carries the phrase forward without a new tongued attack.
    duration = sum(length for _, length in notes)
    t = np.arange(round(RATE * duration)) / RATE
    times, pitches, elapsed = [0], [notes[0][0] - .24], 0.
    for i, (note, length) in enumerate(notes):
        times.extend([elapsed + min(.09, length * .3), elapsed + length - .042])
        pitches.extend([note, note])
        elapsed += length
    times.append(duration)
    pitches.append(notes[-1][0] - .12)
    vibrato = .095 * np.sin(2*np.pi*(4.6*t+.17*t*t)) * np.clip((t-.23)/.47, 0, 1)
    freq = hz(np.interp(t, times, pitches) + vibrato)
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    attack = np.sin(.5*np.pi*np.minimum(t/.14, 1))**2
    decay = np.sin(.5*np.pi*np.clip((duration-t)/.28, 0, 1))**2
    phrase = attack*decay*(.83+.17*np.sin(np.pi*t/duration))*(1+.022*np.sin(2*np.pi*4.9*t))
    jet = band(rng.normal(size=len(t)), 1150, 4600)
    partials = np.sin(phase)+.23*np.sin(2*phase+.21)+.105*np.sin(3*phase+.42)+.045*np.sin(4*phase)
    tone = partials + jet * (.13 + .21*np.exp(-t*9))
    put(at, strength*.19*tone*phrase, .23, .61)


def drum(at, gain):
    t = np.arange(round(RATE*.66)) / RATE
    phase = 2*np.pi*(67*t+.94*(1-np.exp(-t*18)))
    skin = (np.sin(phase)+.32*np.sin(phase*1.48)) * np.exp(-t*9)
    put(at,.22*gain*skin*(1-np.exp(-t*210)),.04,.39)


# Free opening, then a pulse under the turning sluice (4.6 s). The high note
# resolves before the real-time chime at 15.375 s; its reverberation gets the coda.
for note in [
    (.24,50,.74,0), (1.28,57,.57,0), (2.58,60,.57,2), (3.84,57,.37,0),
    (4.67,43,.76,0), (5.06,50,.49,0), (5.79,55,.49,0), (6.69,62,.36,0),
    (7.86,48,.57,0), (8.36,55,.44,0), (9.46,57,.47,-2),
    (10.73,50,.67,0), (11.27,57,.39,0), (12.03,62,.43,0),
    (12.92,55,.47,0), (13.59,57,.42,0), (14.35,50,.62,0)
]:
    qin(*note)
qin(3.34,69,.26,harmonic=True)
qin(12.29,74,.21,harmonic=True)
xiao(4.92, [(69,.78),(72,.33),(74,.92),(72,.39),(69,.90)], .86)
xiao(8.84, [(67,.62),(69,.39),(72,.75),(74,.83)], .91)
xiao(11.86, [(76,.65),(74,.58),(69,.41),(67,.38),(62,.88)], .77)
for at, gain in [(4.56,.64),(7.83,.35),(10.71,.51),(12.92,.29)]:
    drum(at,gain)

# A short stone-gallery response. Discrete early reflections keep the pluck
# articulate; the diffuse tails of the two channels decorrelate in headphones.
for channel, early in enumerate([(.049,.106,.181),(.069,.133,.209)]):
    t = np.arange(round(1.85*RATE))/RATE
    tail = band(rng.normal(size=len(t)), 180, 3400) * np.exp(-t*3.75)
    tail *= (1-np.exp(-t*12)) * .0029
    for delay, level in zip(early,[.28,.17,.10]):
        tail[round(delay*RATE)] += level
    wet = fftconvolve(room_send[:,channel]*.8+room_send[:,1-channel]*.2,tail)
    mix[:,channel] += wet[:len(mix)]
mix *= .78/np.max(np.abs(mix))
dest=Path(__file__).resolve().parents[1]/'public'/'audio'/'过桥听雨.m4a'
dest.parent.mkdir(parents=True,exist_ok=True)
subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(RATE),'-ac','2','-i','pipe:0',
                '-c:a','aac','-b:a','256k','-metadata','title=过桥听雨','-movflags','+faststart',str(dest)],
               input=mix.astype('<f4').tobytes(),check=True)
print(dest)
