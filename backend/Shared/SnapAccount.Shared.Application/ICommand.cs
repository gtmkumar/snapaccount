using MediatR;
using SnapAccount.Shared.Domain;

namespace SnapAccount.Shared.Application;

public interface ICommand : IRequest<Result>
{
}

public interface ICommand<TResponse> : IRequest<Result<TResponse>>
{
}
