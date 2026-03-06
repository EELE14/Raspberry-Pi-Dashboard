import asyncio
import errno
import fcntl
import os
import pty
import struct
import termios


def _resize_pty(master_fd: int, cols: int, rows: int) -> None:
    winsize = struct.pack("HHHH", rows, cols, 0, 0)
    try:
        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
    except OSError:
        pass


async def create_pty_process(
    cols: int = 80,
    rows: int = 24,
    command: list[str] | None = None,
) -> tuple[asyncio.subprocess.Process, int]:

    if command is None:
        command = ["/bin/bash", "-l"]

    master_fd, slave_fd = pty.openpty()

# apply initial size
    _resize_pty(master_fd, cols, rows)



    fl = fcntl.fcntl(master_fd, fcntl.F_GETFL)
    fcntl.fcntl(master_fd, fcntl.F_SETFL, fl | os.O_NONBLOCK)

    env = {
        **os.environ,
        "TERM": "xterm-256color",
        "COLORTERM": "truecolor",
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
    }



    def _setup_child() -> None:
        os.setsid()  # Create a new session 
        # Make slave_fd the controlling terminal of the new session
        try:
            fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)
        except (AttributeError, OSError):
            pass

    try:
        proc = await asyncio.create_subprocess_exec(
            *command,
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            env=env,
            preexec_fn=_setup_child,
        )
    finally:


        os.close(slave_fd)

    return proc, master_fd


async def pump_pty_to_queue(
    master_fd: int,
    queue: asyncio.Queue[bytes | None],
) -> None:


    loop = asyncio.get_running_loop()
    _reader_active = True  # Guard against double remove_reader

    def _signal_eof() -> None:
        nonlocal _reader_active
        if _reader_active:
            _reader_active = False
            loop.remove_reader(master_fd)
        # if queue is full, drop oldest chunk to ensure None lands
        if queue.full():
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
        try:
            queue.put_nowait(None)
        except asyncio.QueueFull:
            pass  # unlikely after the drain above — tolerate it

    def _on_readable() -> None:
        try:
            data = os.read(master_fd, 4096)
            if not data:

                _signal_eof()
                return
            try:
                queue.put_nowait(data)
            except asyncio.QueueFull:
                # Queue backed up (slow client),  drop this chunk to avoid
                # blocking the event loop. 
                pass
        except (BlockingIOError, InterruptedError):

            pass
        except OSError as exc:

            if exc.errno in (errno.EIO, errno.EBADF) or exc.errno is None:
                _signal_eof()

    loop.add_reader(master_fd, _on_readable)
    try:

        await asyncio.get_running_loop().create_future()
    except asyncio.CancelledError:
        pass
    finally:
        if _reader_active:
            loop.remove_reader(master_fd)


def write_input(master_fd: int, data: str) -> None:
    try:
        os.write(master_fd, data.encode("utf-8"))
    except OSError:
        pass


def apply_resize(master_fd: int, cols: int, rows: int) -> None:
    _resize_pty(master_fd, max(1, cols), max(1, rows))


async def terminate_process(proc: asyncio.subprocess.Process, master_fd: int) -> None:
    try:
        proc.terminate()
        await asyncio.wait_for(proc.wait(), timeout=3.0)
    except asyncio.TimeoutError:
        try:
            proc.kill()
            await asyncio.wait_for(proc.wait(), timeout=2.0)
        except (ProcessLookupError, asyncio.TimeoutError):
            pass
    except ProcessLookupError:
        pass


    try:
        os.close(master_fd)
    except OSError:
        pass
