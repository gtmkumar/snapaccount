namespace SnapAccount.Shared.Domain;

public class Result<T>
{
    private readonly T? _value;

    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;
    public Error Error { get; }
    public T Value => IsSuccess ? _value! : throw new InvalidOperationException("Cannot access value of a failed result.");

    private Result(T value)
    {
        IsSuccess = true;
        _value = value;
        Error = Error.None;
    }

    private Result(Error error)
    {
        IsSuccess = false;
        Error = error;
    }

    public static Result<T> Success(T value) => new(value);
    public static Result<T> Failure(Error error) => new(error);

    public static implicit operator Result<T>(T value) => Success(value);
    public static implicit operator Result<T>(Error error) => Failure(error);

    public TResult Match<TResult>(Func<T, TResult> onSuccess, Func<Error, TResult> onFailure)
        => IsSuccess ? onSuccess(Value) : onFailure(Error);
}

public class Result
{
    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;
    public Error Error { get; }

    private Result() { IsSuccess = true; Error = Error.None; }
    private Result(Error error) { IsSuccess = false; Error = error; }

    public static Result Success() => new();
    public static Result Failure(Error error) => new(error);
}
